import { z } from "zod";
import { allocate, scaled } from "./domain";
import {
  ApiError,
  audit,
  db,
  owned,
  rows,
  statement,
  uid,
  type Context,
} from "./server";
export const stockInput = z.object({
  id: z.string().uuid(),
  productId: z.string(),
  warehouseId: z.string(),
  kind: z.enum([
    "in",
    "out",
    "count",
    "damaged",
    "supplier_return",
    "customer_return",
    "lost",
    "transfer",
  ]),
  quantity: z
    .number()
    .nonnegative()
    .max(1e9)
    .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-5),
  expected: z.number().nonnegative().optional(),
  toWarehouseId: z.string().optional(),
  lot: z.string().max(100).optional(),
  expires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (s) =>
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
    )
    .optional()
    .or(z.literal("")),
  reason: z.string().max(500).default(""),
  invoice: z.string().max(100).default(""),
});
export type StockInput = z.infer<typeof stockInput>;
export async function stockStatements(
  c: Context,
  x: StockInput,
): Promise<D1PreparedStatement[]> {
  const amount = scaled(x.quantity);
  if (x.kind !== "count" && amount === 0)
    throw new ApiError(400, "أدخل كمية أكبر من صفر");
  const p = await owned("products", x.productId, c);
  await owned("warehouses", x.warehouseId, c);
  if (!p.active) throw new ApiError(400, "المنتج مؤرشف");
  if (
    ["count", "damaged", "lost", "supplier_return"].includes(x.kind) &&
    !x.reason.trim()
  )
    throw new ApiError(400, "اكتب سبب العملية");
  const available = await rows<{
    id: string;
    quantity: number;
    expires: string | null;
    lot: string;
  }>(
    "SELECT * FROM batches WHERE business_id=? AND product_id=? AND warehouse_id=? AND quantity>0 ORDER BY expires IS NULL,expires,created_at,id",
    c.business,
    x.productId,
    x.warehouseId,
  );
  const total = available.reduce((n, b) => n + b.quantity, 0);
  let delta = amount;
  if (
    ["out", "damaged", "lost", "supplier_return", "transfer"].includes(x.kind)
  )
    delta = -amount;
  if (x.kind === "count") {
    if (x.expected === undefined || scaled(x.expected) !== total)
      throw new ApiError(409, "تغيّر المخزون أثناء الجرد، حدّث الكمية المسجلة");
    delta = amount - total;
  }
  const statements: D1PreparedStatement[] = [];
  const move = (
    batchId: string,
    warehouseId: string,
    d: number,
    expected: number | null = null,
  ) =>
    statement(
      "INSERT INTO movements(id,business_id,operation_id,product_id,warehouse_id,batch_id,delta,expected,kind,actor,reason,invoice) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      uid(),
      c.business,
      x.id,
      x.productId,
      warehouseId,
      batchId,
      d,
      expected,
      x.kind,
      c.actor,
      x.reason,
      x.invoice,
    );
  const add = (
    warehouseId: string,
    q: number,
    lot: string,
    expires: string | null,
    expected: number | null = null,
  ) => {
    const id = uid();
    statements.push(
      statement(
        "INSERT INTO batches(id,business_id,product_id,warehouse_id,lot,expires) VALUES(?,?,?,?,?,?)",
        id,
        c.business,
        x.productId,
        warehouseId,
        lot,
        expires,
      ),
      move(id, warehouseId, q, expected),
    );
  };
  if (x.kind === "transfer") {
    if (!x.toWarehouseId || x.toWarehouseId === x.warehouseId)
      throw new ApiError(400, "اختر مخزنًا آخر");
    await owned("warehouses", x.toWarehouseId, c);
  }
  if (delta < 0) {
    const eligible =
      x.kind === "out"
        ? available.filter(
            (b) =>
              !b.expires || b.expires >= new Date().toISOString().slice(0, 10),
          )
        : available;
    if (eligible.reduce((sum, b) => sum + b.quantity, 0) < -delta)
      throw new ApiError(
        409,
        "الكمية المطلوبة أكبر من المخزون المتاح غير المنتهي",
      );
    let first = true;
    for (const part of allocate(eligible, -delta)) {
      statements.push(
        move(
          part.batch.id,
          x.warehouseId,
          -part.amount,
          x.kind === "count" && first ? total : null,
        ),
      );
      first = false;
      if (x.kind === "transfer")
        add(x.toWarehouseId!, part.amount, part.batch.lot, part.batch.expires);
    }
  } else {
    if (p.expiry_enabled && delta > 0 && !x.expires)
      throw new ApiError(400, "حدد تاريخ الصلاحية");
    add(
      x.warehouseId,
      delta,
      x.lot || `LOT-${new Date().toISOString().slice(0, 10)}`,
      x.expires || null,
      x.kind === "count" ? total : null,
    );
  }
  statements.push(
    audit(
      c,
      x.kind,
      x.productId,
      { warehouse: x.warehouseId, quantity: total / 1000 },
      { quantity: (total + delta) / 1000, operation: x.id },
      x.reason,
    ),
  );
  return statements;
}
export async function executeStock(c: Context, x: StockInput) {
  const fingerprint = JSON.stringify(x);
  const existing = await statement(
    "SELECT business_id,fingerprint FROM operations WHERE id=?",
    x.id,
  ).first<{ business_id: string; fingerprint: string }>();
  if (existing) {
    if (
      existing.business_id !== c.business ||
      existing.fingerprint !== fingerprint
    )
      throw new ApiError(409, "رقم العملية مستخدم لطلب آخر");
    return { id: x.id, repeated: true };
  }
  const list = await stockStatements(c, x);
  await db().batch([
    statement(
      "INSERT INTO operations(id,business_id,actor,kind,reason,fingerprint) VALUES(?,?,?,?,?,?)",
      x.id,
      c.business,
      c.actor,
      x.kind,
      x.reason,
      fingerprint,
    ),
    ...list,
  ]);
  return { id: x.id };
}
