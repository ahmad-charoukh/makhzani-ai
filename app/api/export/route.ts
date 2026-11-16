import { dateRange, movementReportScope, productReportScope, reportFilters, validateReportFilters } from "@/lib/reports";
import { context, errorResponse, rows } from "@/lib/server";
function csv(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export async function GET(r: Request) {
  try {
    const c = await context("reports");
    const params = new URL(r.url).searchParams;
    const movements = params.get("kind") === "movements";
    const range = movements
      ? dateRange(params.get("from"), params.get("to"))
      : null;
    const filters = reportFilters(params);
    await validateReportFilters(c, filters);
    const movement = range ? movementReportScope(c, range, filters) : null;
    const product = productReportScope(filters);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              "\uFEFF" +
                (movements
                  ? ["المنتج", "الحركة", "الكمية", "الوحدة", "المخزن", "المستخدم", "السبب", "التاريخ"]
                  : [
                      "المنتج",
                      "الباركود",
                      "التصنيف",
                      "الوحدة",
                      "الكمية",
                      "حد التنبيه",
                      "سعر الشراء",
                      "سعر البيع",
                    ]
                )
                  .map(csv)
                  .join(",") +
                "\r\n",
            ),
          );
          let cursor = 0;
          for (;;) {
            const list = movements
              ? await rows(
                  `SELECT m.rowid cursor,m.*,p.name,p.unit,w.name warehouse FROM movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id JOIN warehouses w ON w.id=m.warehouse_id AND w.business_id=m.business_id WHERE ${movement!.clause} AND m.rowid>? ORDER BY m.rowid LIMIT 500`,
                  ...movement!.args,
                  cursor,
                )
              : await rows(
                  `SELECT p.rowid cursor,p.*,COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.product_id=p.id AND b.business_id=p.business_id${filters.warehouse ? " AND b.warehouse_id=?" : ""}),0) quantity FROM products p WHERE p.business_id=? AND p.active=1${product.clause} AND p.rowid>? ORDER BY p.rowid LIMIT 500`,
                  ...(filters.warehouse ? [filters.warehouse] : []),
                  c.business,
                  ...product.args,
                  cursor,
                );
            if (!list.length) break;
            for (const x of list) {
              const fields = movements
                ? [
                    x.name,
                    x.kind,
                    Number(x.delta) / 1000,
                    x.unit,
                    x.warehouse,
                    x.actor,
                    x.reason,
                    x.created_at,
                  ]
                : [
                    x.name,
                    x.barcode,
                    x.category,
                    x.unit,
                    Number(x.quantity) / 1000,
                    Number(x.minimum) / 1000,
                    Number(x.purchase_price) / 100,
                    Number(x.selling_price) / 100,
                  ];
              controller.enqueue(
                encoder.encode(fields.map(csv).join(",") + "\r\n"),
              );
            }
            cursor = Number(list.at(-1)!.cursor);
          }
          controller.close();
        } catch (e) {
          console.error(e);
          controller.error(e);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="makhzani-${movements ? "movements" : "stock"}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
