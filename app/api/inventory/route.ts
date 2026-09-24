import { z, ZodError } from "zod";
import {
  ApiError,
  audit,
  context,
  db,
  errorResponse,
  identity,
  mutationGuard,
  owned,
  rateLimit,
  readLimited,
  rows,
  statement,
  uid,
} from "@/lib/server";
import { snapshot } from "@/lib/read-model";
import { executeStock, stockInput } from "@/lib/stock";
import { purchaseAction } from "@/lib/purchases";
import { scaled } from "@/lib/domain";
import { answer } from "@/lib/assistant";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "dashboard";
    const c = await context(
      ["suppliers", "purchases", "audit", "members", "settings"].includes(view)
        ? view === "audit"
          ? "reports"
          : view
        : "read",
    );
    if (view === "detail") {
      const p = await owned("products", url.searchParams.get("id") || "", c);
      if (c.role === "employee") delete p.purchase_price;
      return Response.json({
        product: p,
        batches: await rows(
          "SELECT b.*,w.name warehouse FROM batches b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=? AND b.business_id=? ORDER BY expires IS NULL,expires",
          p.id,
          c.business,
        ),
        images: await rows(
          "SELECT id FROM images WHERE product_id=? AND business_id=?",
          p.id,
          c.business,
        ),
      });
    }
    if (view === "suppliers")
      return Response.json({
        items: await rows(
          `SELECT s.*,COALESCE((SELECT SUM(i.received*i.price/1000.0) FROM purchases p JOIN purchase_items i ON i.purchase_id=p.id WHERE p.supplier_id=s.id),0)-COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id=s.id),0) debt FROM suppliers s WHERE s.business_id=? ORDER BY s.name`,
          c.business,
        ),
        prices: await rows(
          "SELECT sp.*,p.name product,s.name supplier FROM supplier_prices sp JOIN products p ON p.id=sp.product_id JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.business_id=? ORDER BY sp.created_at DESC LIMIT 100",
          c.business,
        ),
      });
    if (view === "purchases")
      return Response.json({
        items: await rows(
          "SELECT p.*,s.name supplier FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.business_id=? ORDER BY p.created_at DESC LIMIT 100",
          c.business,
        ),
        lines: await rows(
          "SELECT i.*,p.name product,p.unit FROM purchase_items i JOIN products p ON p.id=i.product_id JOIN purchases o ON o.id=i.purchase_id WHERE o.business_id=? ORDER BY o.created_at DESC LIMIT 500",
          c.business,
        ),
      });
    if (view === "audit")
      return Response.json({
        items: await rows(
          "SELECT * FROM audit_logs WHERE business_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
          c.business,
        ),
      });
    if (view === "members")
      return Response.json({
        items: await rows(
          "SELECT id,email,role,active FROM members WHERE business_id=?",
          c.business,
        ),
      });
    if (view === "settings")
      return Response.json(
        await statement(
          "SELECT * FROM settings WHERE business_id=?",
          c.business,
        ).first(),
      );
    return Response.json(
      await snapshot(
        c,
        (url.searchParams.get("q") || "").slice(0, 100),
        Math.min(10000, Math.max(1, Number(url.searchParams.get("page")) || 1)),
        {
          category: (url.searchParams.get("category") || "").slice(0, 100),
          stock: url.searchParams.get("stock") || "all",
          warehouse: (url.searchParams.get("warehouse") || "").slice(0, 100),
          sort: url.searchParams.get("sort") || "name-asc",
        },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(150),
  barcode: z.string().trim().min(1).max(100),
  sku: z.string().trim().min(1).max(100),
  category: z.string().max(100).default("عام"),
  subcategory: z.string().max(100).default(""),
  brand: z.string().max(100).default(""),
  description: z.string().max(2000).default(""),
  unit: z.string().min(1).max(40).default("قطعة"),
  minimum: z.number().nonnegative().default(5),
  purchasePrice: z.number().nonnegative().max(1e9).default(0),
  sellingPrice: z.number().nonnegative().max(1e9).default(0),
  tax: z.number().min(0).max(100).default(0),
  supplierId: z.string().nullable().optional(),
  shelf: z.string().max(100).default(""),
  notes: z.string().max(1000).default(""),
  expiryEnabled: z.boolean().default(false),
});
export async function POST(request: Request) {
  try {
    mutationGuard(request);
    if (Number(request.headers.get("content-length")) > 150000)
      throw new ApiError(413, "الطلب كبير جدًا");
    const raw = z
      .record(z.unknown())
      .parse(
        JSON.parse(
          new TextDecoder().decode(await readLimited(request, 150000)),
        ),
      );
    const type = z.string().parse(raw.type);
    const actor = await identity();
    await rateLimit(actor.userId);
    if (type === "setup") {
      const u = await identity();
      const name = z.string().trim().min(1).max(100).parse(raw.name);
      const id = uid();
      const exists = await statement(
        "SELECT id FROM members WHERE email=? AND active=1",
        u.email.toLowerCase(),
      ).first();
      if (exists) throw new ApiError(409, "لديك مخزن بالفعل");
      await db().batch([
        statement(
          "INSERT INTO businesses(id,name,owner) VALUES(?,?,?)",
          id,
          name,
          u.userId,
        ),
        statement(
          "INSERT INTO members(id,business_id,email,role) VALUES(?,?,?,?)",
          uid(),
          id,
          u.email.toLowerCase(),
          "owner",
        ),
        statement(
          "INSERT INTO warehouses(id,business_id,name) VALUES(?,?,?)",
          uid(),
          id,
          "المخزن الرئيسي",
        ),
        statement("INSERT INTO settings(business_id) VALUES(?)", id),
      ]);
      return Response.json({ ok: true });
    }
    const action =
      type === "stock"
        ? "stock"
        : type === "assistant"
          ? "assistant"
          : type === "product"
            ? "products"
            : type === "archive"
              ? "products"
              : type === "supplier" || type === "payment"
                ? "suppliers"
                : type === "purchase"
                  ? "purchases"
                  : type;
    const c = await context(action);
    if (type === "stock")
      return Response.json(await executeStock(c, stockInput.parse(raw)));
    if (type === "assistant")
      return Response.json(
        await answer(c, z.string().min(1).max(1000).parse(raw.question)),
      );
    if (type === "product") {
      const p = productSchema.parse(raw);
      if (p.supplierId) await owned("suppliers", p.supplierId, c);
      const id = p.id || uid();
      const before = p.id ? await owned("products", id, c) : null;
      const args = [
        p.name,
        p.barcode,
        p.sku,
        p.category,
        p.subcategory,
        p.brand,
        p.description,
        p.unit,
        scaled(p.minimum),
        Math.round(p.purchasePrice * 100),
        Math.round(p.sellingPrice * 100),
        p.tax,
        p.supplierId || null,
        p.shelf,
        p.notes,
        p.expiryEnabled ? 1 : 0,
      ];
      const s = p.id
        ? statement(
            "UPDATE products SET name=?,barcode=?,sku=?,category=?,subcategory=?,brand=?,description=?,unit=?,minimum=?,purchase_price=?,selling_price=?,tax=?,supplier_id=?,shelf=?,notes=?,expiry_enabled=? WHERE id=? AND business_id=?",
            ...args,
            id,
            c.business,
          )
        : statement(
            "INSERT INTO products(name,barcode,sku,category,subcategory,brand,description,unit,minimum,purchase_price,selling_price,tax,supplier_id,shelf,notes,expiry_enabled,id,business_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ...args,
            id,
            c.business,
          );
      await db().batch([
        s,
        audit(c, p.id ? "product.update" : "product.create", id, before, p),
      ]);
      return Response.json({ id });
    }
    if (type === "archive") {
      const id = z.string().parse(raw.id);
      const before = await owned("products", id, c);
      const stock = await statement(
        "SELECT SUM(quantity) total FROM batches WHERE product_id=?",
        id,
      ).first<{ total: number }>();
      if (stock?.total)
        throw new ApiError(400, "لا يمكن أرشفة منتج لديه مخزون");
      await db().batch([
        statement(
          "UPDATE products SET active=0 WHERE id=? AND business_id=?",
          id,
          c.business,
        ),
        audit(c, "product.archive", id, before, null),
      ]);
      return Response.json({ ok: true });
    }
    if (type === "supplier") {
      const s = z
        .object({
          id: z.string().optional(),
          name: z.string().min(1).max(150),
          phone: z.string().max(40).default(""),
          email: z.string().max(150).default(""),
          address: z.string().max(500).default(""),
          taxInfo: z.string().max(200).default(""),
          notes: z.string().max(1000).default(""),
        })
        .parse(raw);
      const id = s.id || uid();
      const before = s.id ? await owned("suppliers", id, c) : null;
      await db().batch([
        s.id
          ? statement(
              "UPDATE suppliers SET name=?,phone=?,email=?,address=?,tax_info=?,notes=? WHERE id=? AND business_id=?",
              s.name,
              s.phone,
              s.email,
              s.address,
              s.taxInfo,
              s.notes,
              id,
              c.business,
            )
          : statement(
              "INSERT INTO suppliers(id,business_id,name,phone,email,address,tax_info,notes) VALUES(?,?,?,?,?,?,?,?)",
              id,
              c.business,
              s.name,
              s.phone,
              s.email,
              s.address,
              s.taxInfo,
              s.notes,
            ),
        audit(c, "supplier.save", id, before, s),
      ]);
      return Response.json({ id });
    }
    if (type === "payment") {
      const x = z
        .object({
          supplierId: z.string(),
          amount: z.number().positive().max(1e9),
          note: z.string().max(500).default(""),
        })
        .parse(raw);
      await owned("suppliers", x.supplierId, c);
      const id = uid();
      await db().batch([
        statement(
          "INSERT INTO payments(id,business_id,supplier_id,amount,note) VALUES(?,?,?,?,?)",
          id,
          c.business,
          x.supplierId,
          Math.round(x.amount * 100),
          x.note,
        ),
        audit(c, "payment", id, null, x),
      ]);
      return Response.json({ ok: true });
    }
    if (type === "purchase") return Response.json(await purchaseAction(c, raw));
    if (type === "warehouses") {
      const x = z
        .object({
          name: z.string().min(1).max(100),
          branch: z.string().min(1).max(100),
        })
        .parse(raw);
      const id = uid();
      await db().batch([
        statement(
          "INSERT INTO warehouses(id,business_id,name,branch) VALUES(?,?,?,?)",
          id,
          c.business,
          x.name,
          x.branch,
        ),
        audit(c, "warehouse.create", id, null, x),
      ]);
      return Response.json({ id });
    }
    if (type === "members") {
      const x = z
        .object({
          email: z.string().email(),
          role: z.enum(["manager", "employee"]),
          active: z.boolean().default(true),
        })
        .parse(raw);
      const existing = await statement(
        "SELECT * FROM members WHERE business_id=? AND email=?",
        c.business,
        x.email.toLowerCase(),
      ).first();
      if (existing?.role === "owner")
        throw new ApiError(400, "لا يمكن تغيير المالك");
      const id = existing?.id || uid();
      await db().batch([
        statement(
          "INSERT INTO members(id,business_id,email,role,active) VALUES(?,?,?,?,?) ON CONFLICT(business_id,email) DO UPDATE SET role=excluded.role,active=excluded.active",
          id,
          c.business,
          x.email.toLowerCase(),
          x.role,
          x.active ? 1 : 0,
        ),
        audit(c, "member.save", String(id), existing, x),
      ]);
      return Response.json({ ok: true });
    }
    if (type === "settings") {
      const x = z
        .object({
          units: z.array(z.string().min(1).max(30)).max(30),
          currency: z.enum(["TRY", "USD", "SAR", "EUR"]),
        })
        .parse(raw);
      await db().batch([
        statement(
          "UPDATE settings SET units=?,currency=? WHERE business_id=?",
          JSON.stringify(x.units),
          x.currency,
          c.business,
        ),
        audit(c, "settings", c.business, null, x),
      ]);
      return Response.json({ ok: true });
    }
    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    if (e instanceof ZodError)
      return Response.json(
        {
          error: "راجع الحقول المطلوبة والكميات المدخلة",
          details: e.issues.map((i) => i.path.join(".")),
        },
        { status: 400 },
      );
    return errorResponse(e);
  }
}
