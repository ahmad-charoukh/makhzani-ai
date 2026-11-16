import { ApiError, owned, rows, statement, type Context } from "./server";
export type ReportFilters = {
  q?: string;
  category?: string;
  warehouse?: string;
  supplier?: string;
};
export function reportFilters(params: URLSearchParams): ReportFilters {
  return Object.fromEntries(
    ["q", "category", "warehouse", "supplier"].map((key) => [
      key,
      (params.get(key) || "").trim().slice(0, 100),
    ]),
  );
}
export async function validateReportFilters(c: Context, filters: ReportFilters) {
  await Promise.all([
    filters.warehouse ? owned("warehouses", filters.warehouse, c) : null,
    filters.supplier ? owned("suppliers", filters.supplier, c) : null,
  ]);
}
// Product aliases are fixed by callers; user input is always bound separately.
export function productReportScope(filters: ReportFilters, purchase = false) {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (filters.q) {
    const term = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\')");
    args.push(term, term, term);
  }
  if (filters.category) {
    clauses.push("p.category=?");
    args.push(filters.category);
  }
  if (filters.supplier) {
    clauses.push(purchase ? "o.supplier_id=?" : "p.supplier_id=?");
    args.push(filters.supplier);
  }
  return { clause: clauses.length ? " AND " + clauses.join(" AND ") : "", args };
}
export function movementReportScope(c: Context, range: DateRange, filters: ReportFilters) {
  const product = productReportScope(filters);
  return {
    clause: `m.business_id=? AND m.created_at>=? AND m.created_at<?${product.clause}${filters.warehouse ? " AND m.warehouse_id=?" : ""}`,
    args: [c.business, range.from, range.until, ...product.args, ...(filters.warehouse ? [filters.warehouse] : [])],
  };
}
export type DateRange = { from: string; to: string; until: string };
export function dateRange(from: string | null, to: string | null): DateRange {
  const end = to || new Date().toISOString().slice(0, 10);
  const start =
    from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    !valid(start) ||
    !valid(end) ||
    start > end ||
    Date.parse(end) - Date.parse(start) > 365 * 86400000
  )
    throw new ApiError(400, "اختر فترة صحيحة لا تتجاوز سنة");
  return {
    from: start,
    to: end,
    until: new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10),
  };
}
export async function report(c: Context, range: DateRange, page = 1, filters: ReportFilters = {}) {
  await validateReportFilters(c, filters);
  page = Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)));
  const { from, until } = range;
  const { clause, args } = movementReportScope(c, range, filters);
  const product = productReportScope(filters);
  const purchase = productReportScope(filters, true);
  const [summary, daily, matches, losses, suppliers, valuation, warehouses, categories, supplierOptions] =
    await Promise.all([
      statement(
        `SELECT COUNT(DISTINCT m.operation_id) operations,COALESCE(SUM(CASE WHEN m.kind IN ('in','customer_return') THEN m.delta ELSE 0 END),0) incoming,COALESCE(SUM(CASE WHEN m.kind IN ('out','supplier_return') THEN -m.delta ELSE 0 END),0) outgoing,COUNT(DISTINCT CASE WHEN m.kind='count' THEN m.operation_id END) counts FROM movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id WHERE ${clause}`,
        ...args,
      ).first(),
      rows(
        `SELECT date(m.created_at) day,SUM(CASE WHEN m.kind IN ('in','customer_return') THEN m.delta ELSE 0 END) incoming,SUM(CASE WHEN m.kind IN ('out','supplier_return') THEN -m.delta ELSE 0 END) outgoing,COUNT(*) count FROM movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id WHERE ${clause} GROUP BY date(m.created_at) ORDER BY day`,
        ...args,
      ),
      rows(
        `SELECT m.id,m.delta,m.kind,m.reason,m.created_at,m.actor,p.name,p.unit,w.name warehouse FROM movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id JOIN warehouses w ON w.id=m.warehouse_id AND w.business_id=m.business_id WHERE ${clause} ORDER BY m.created_at DESC,m.rowid DESC LIMIT 51 OFFSET ?`,
        ...args,
        (page - 1) * 50,
      ),
      rows(
        `SELECT p.name,p.unit,m.kind,SUM(-m.delta) quantity,SUM(-m.delta*p.purchase_price/100000.0) estimated_value FROM movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id WHERE ${clause} AND m.kind IN ('damaged','lost') GROUP BY p.id,m.kind ORDER BY estimated_value DESC`,
        ...args,
      ),
      rows(
        `SELECT s.name,COUNT(DISTINCT o.id) orders,COALESCE(SUM(i.quantity*i.price/100000.0),0) ordered_value,COALESCE(SUM(i.received*i.price/100000.0),0) received_value FROM purchases o JOIN suppliers s ON s.id=o.supplier_id AND s.business_id=o.business_id JOIN purchase_items i ON i.purchase_id=o.id JOIN products p ON p.id=i.product_id AND p.business_id=o.business_id WHERE o.business_id=? AND o.created_at>=? AND o.created_at<? AND o.status!='cancelled'${purchase.clause} GROUP BY s.id ORDER BY received_value DESC`,
        c.business, from, until, ...purchase.args,
      ),
      statement(
        `SELECT COALESCE(SUM(b.quantity*p.purchase_price/100000.0),0) value FROM batches b JOIN products p ON p.id=b.product_id AND p.business_id=b.business_id WHERE b.business_id=?${product.clause}${filters.warehouse ? " AND b.warehouse_id=?" : ""}`,
        c.business, ...product.args, ...(filters.warehouse ? [filters.warehouse] : []),
      ).first(),
      rows("SELECT id,name FROM warehouses WHERE business_id=? ORDER BY name", c.business),
      rows<{ category: string }>("SELECT DISTINCT category FROM products WHERE business_id=? ORDER BY category", c.business),
      rows("SELECT id,name FROM suppliers WHERE business_id=? ORDER BY name", c.business),
    ]);
  return {
    range,
    summary,
    daily,
    movements: matches.slice(0, 50),
    losses,
    suppliers,
    valuation,
    page,
    filters,
    options: { warehouses, categories: categories.map((item) => item.category), suppliers: supplierOptions },
    hasMore: matches.length > 50,
  };
}
