import { z } from "zod";
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
import { scaled, statusTransitions } from "./domain";
import { stockStatements } from "./stock";
export async function purchaseAction(c: Context, raw: unknown) {
  const x = z
    .object({
      action: z.enum(["create", "status", "receive"]),
      id: z.string().optional(),
      supplierId: z.string().optional(),
      status: z.string().optional(),
      warehouseId: z.string().optional(),
      operationId: z.string().uuid().optional(),
      notes: z.string().max(1000).default(""),
      items: z
        .array(
          z.object({
            productId: z.string(),
            quantity: z.number().positive(),
            price: z.number().nonnegative(),
            expires: z.string().optional(),
            lot: z.string().optional(),
          }),
        )
        .max(100)
        .optional(),
    })
    .parse(raw);
  if (x.action === "create") {
    if (!x.supplierId || !x.items?.length)
      throw new ApiError(400, "أضف المورد والمنتجات");
    await owned("suppliers", x.supplierId, c);
    if (new Set(x.items.map((i) => i.productId)).size !== x.items.length)
      throw new ApiError(400, "المنتج مكرر في الطلب؛ اجمع الكميات في سطر واحد");
    const id = uid();
    const list = [
      statement(
        "INSERT INTO purchases(id,business_id,supplier_id,notes) VALUES(?,?,?,?)",
        id,
        c.business,
        x.supplierId,
        x.notes,
      ),
    ];
    for (const it of x.items) {
      await owned("products", it.productId, c);
      list.push(
        statement(
          "INSERT INTO purchase_items(id,purchase_id,product_id,quantity,price) VALUES(?,?,?,?,?)",
          uid(),
          id,
          it.productId,
          scaled(it.quantity),
          Math.round(it.price * 100),
        ),
      );
    }
    list.push(audit(c, "purchase.create", id, null, x));
    await db().batch(list);
    return { id };
  }
  const p = await owned("purchases", x.id || "", c);
  if (x.action === "status") {
    if (!statusTransitions[String(p.status)]?.includes(x.status || ""))
      throw new ApiError(400, "لا يمكن تغيير حالة الطلب بهذه الطريقة");
    await db().batch([
      statement(
        "UPDATE purchases SET status=? WHERE id=? AND business_id=?",
        x.status,
        x.id,
        c.business,
      ),
      audit(c, "purchase.status", x.id!, p, x),
    ]);
    return { ok: true };
  }
  if (!x.warehouseId || !x.operationId || !x.items?.length)
    throw new ApiError(400, "حدد المخزن والكميات المستلمة");
  const prior = await statement(
    "SELECT business_id,fingerprint FROM operations WHERE id=?",
    x.operationId,
  ).first<{ business_id: string; fingerprint: string }>();
  if (prior) {
    if (
      prior.business_id !== c.business ||
      prior.fingerprint !== JSON.stringify(x)
    )
      throw new ApiError(409, "رقم عملية مكرر");
    return { ok: true, repeated: true };
  }
  if (!["confirmed", "partial"].includes(String(p.status)))
    throw new ApiError(400, "أكد الطلب أولًا");
  const items = await rows<{
    id: string;
    product_id: string;
    quantity: number;
    received: number;
    price: number;
  }>("SELECT * FROM purchase_items WHERE purchase_id=?", x.id);
  const list = [
    statement(
      "INSERT INTO operations(id,business_id,actor,kind,fingerprint) VALUES(?,?,?,?,?)",
      x.operationId,
      c.business,
      c.actor,
      "purchase",
      JSON.stringify(x),
    ),
  ];
  for (const it of x.items) {
    const row = items.find((i) => i.product_id === it.productId);
    if (!row || scaled(it.quantity) > row.quantity - row.received)
      throw new ApiError(400, "الكمية تتجاوز المتبقي من الطلب");
    list.push(
      statement(
        "UPDATE purchase_items SET received=received+? WHERE id=?",
        scaled(it.quantity),
        row.id,
      ),
    );
    list.push(
      ...(await stockStatements(c, {
        id: x.operationId,
        kind: "in",
        productId: it.productId,
        warehouseId: x.warehouseId,
        quantity: it.quantity,
        expires: it.expires,
        lot: it.lot,
        reason: "استلام طلب شراء",
        invoice: x.id!,
      })),
    );
    list.push(
      statement(
        "INSERT INTO supplier_prices(id,business_id,supplier_id,product_id,price) VALUES(?,?,?,?,?)",
        uid(),
        c.business,
        p.supplier_id,
        it.productId,
        row.price,
      ),
    );
  }
  list.push(
    statement(
      "UPDATE purchases SET status=CASE WHEN EXISTS(SELECT 1 FROM purchase_items WHERE purchase_id=? AND received<quantity) THEN 'partial' ELSE 'received' END WHERE id=?",
      x.id,
      x.id,
    ),
    audit(c, "purchase.receive", x.id!, p, x),
  );
  await db().batch(list);
  return { ok: true };
}
