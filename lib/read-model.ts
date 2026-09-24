import { owned, rows, statement, type Context } from "./server";
import { reorder } from "./domain";
type InventoryQuery = {
  category?: string;
  stock?: string;
  warehouse?: string;
  sort?: string;
};
const inventoryOrder: Record<string, string> = {
  "name-asc": "name COLLATE NOCASE ASC,id ASC",
  "name-desc": "name COLLATE NOCASE DESC,id ASC",
  "quantity-asc": "quantity ASC,name COLLATE NOCASE ASC,id ASC",
  "quantity-desc": "quantity DESC,name COLLATE NOCASE ASC,id ASC",
  "price-asc": "selling_price ASC,name COLLATE NOCASE ASC,id ASC",
  "price-desc": "selling_price DESC,name COLLATE NOCASE ASC,id ASC",
};
export async function snapshot(
  c: Context,
  q = "",
  page = 1,
  filters: InventoryQuery = {},
) {
  if (filters.warehouse) await owned("warehouses", filters.warehouse, c);
  const term = `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;
  const warehouseClause = filters.warehouse ? " AND b.warehouse_id=?" : "";
  const productQuery = `SELECT p.*,COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.product_id=p.id AND b.business_id=p.business_id${warehouseClause}),0) quantity,s.name supplier_name FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.business_id=p.business_id WHERE p.business_id=? AND p.active=1 AND (p.name LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.category LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')${filters.category ? " AND p.category=?" : ""}`;
  const args: unknown[] = [
    ...(filters.warehouse ? [filters.warehouse] : []),
    c.business,
    ...Array(6).fill(term),
    ...(filters.category ? [filters.category] : []),
  ];
  const stockClause =
    filters.stock === "empty"
      ? "quantity=0"
      : filters.stock === "low"
        ? "quantity>0 AND quantity<=minimum"
        : filters.stock === "available"
          ? "quantity>minimum"
          : "1=1";
  const filteredQuery = `FROM (${productQuery}) inventory WHERE ${stockClause}`;
  const count = await statement(
    `SELECT COUNT(*) total ${filteredQuery}`,
    ...args,
  ).first<{ total: number }>();
  const totalProducts = Number(count?.total || 0);
  const pageCount = Math.max(1, Math.ceil(totalProducts / 30));
  page = Math.min(pageCount, Math.max(1, Math.floor(Number(page) || 1)));
  const order = Object.prototype.hasOwnProperty.call(
    inventoryOrder,
    filters.sort || "",
  )
    ? inventoryOrder[filters.sort!]
    : inventoryOrder["name-asc"];
  const matches = await rows(
    `SELECT inventory.*,(SELECT id FROM images i WHERE i.product_id=inventory.id AND i.business_id=inventory.business_id ORDER BY created_at LIMIT 1) image_id,COALESCE((SELECT SUM(-m.delta) FROM movements m WHERE m.product_id=inventory.id AND m.business_id=inventory.business_id AND m.kind='out' AND m.created_at>=datetime('now','-30 days')${filters.warehouse ? " AND m.warehouse_id=?" : ""}),0) out30 ${filteredQuery} ORDER BY ${order} LIMIT 31 OFFSET ?`,
    ...(filters.warehouse ? [filters.warehouse] : []),
    ...args,
    (page - 1) * 30,
  );
  const hasMore = matches.length > 30;
  const products = matches.slice(0, 30);
  for (const p of products) {
    p.reorder = reorder(Number(p.quantity), Number(p.out30), Number(p.minimum));
    if (c.role === "employee") {
      delete p.purchase_price;
      delete p.out30;
    }
  }
  const stats = await statement(
    `SELECT COUNT(*) products,COALESCE(SUM(qty),0) quantity,COALESCE(SUM(CASE WHEN qty<=minimum AND qty>0 THEN 1 ELSE 0 END),0) low,COALESCE(SUM(CASE WHEN qty=0 THEN 1 ELSE 0 END),0) empty,COALESCE(SUM(qty*purchase_price/100000.0),0) value FROM (SELECT p.*,COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.product_id=p.id),0) qty FROM products p WHERE business_id=? AND active=1)`,
    c.business,
  ).first<Record<string, number>>();
  if (stats && c.role === "employee") delete stats.value;
  const [warehouses, movements, low, expiry, daily, business, categories] =
    await Promise.all([
      rows(
        "SELECT * FROM warehouses WHERE business_id=? ORDER BY name",
        c.business,
      ),
      rows(
        "SELECT m.id,m.product_id,m.delta,m.kind,m.reason,m.created_at,m.actor,p.name,p.unit,w.name warehouse FROM movements m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id WHERE m.business_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT 50",
        c.business,
      ),
      rows(
        "SELECT p.id,p.name,p.unit,p.minimum,COALESCE(SUM(b.quantity),0) quantity FROM products p LEFT JOIN batches b ON b.product_id=p.id WHERE p.business_id=? AND p.active=1 GROUP BY p.id HAVING quantity<=p.minimum ORDER BY quantity LIMIT 30",
        c.business,
      ),
      rows(
        "SELECT b.*,p.name,p.unit,w.name warehouse FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.business_id=? AND b.quantity>0 AND b.expires<=date('now','+30 days') ORDER BY b.expires LIMIT 50",
        c.business,
      ),
      rows(
        "SELECT date(created_at) day,SUM(CASE WHEN delta>0 AND kind!='transfer' THEN delta ELSE 0 END) incoming,SUM(CASE WHEN delta<0 AND kind!='transfer' THEN -delta ELSE 0 END) outgoing,COUNT(*) count FROM movements WHERE business_id=? AND created_at>=datetime('now','-30 days') GROUP BY date(created_at) ORDER BY day",
        c.business,
      ),
      statement("SELECT name FROM businesses WHERE id=?", c.business).first(),
      rows<{ category: string }>(
        "SELECT DISTINCT category FROM products WHERE business_id=? AND active=1 AND category!='' ORDER BY category COLLATE NOCASE",
        c.business,
      ),
    ]);
  return {
    products,
    stats,
    warehouses,
    movements,
    low,
    expiry,
    daily,
    business,
    role: c.role,
    email: c.email,
    page,
    hasMore,
    totalProducts,
    pageCount,
    categories: categories.map((p) => p.category),
  };
}
