import { rows, statement, type Context } from "./server";
import { reorder } from "./domain";
export async function snapshot(c: Context, q = "", page = 1) {
  const term = `%${q}%`;
  const products = await rows(
    "SELECT p.*,COALESCE((SELECT SUM(quantity) FROM batches b WHERE b.product_id=p.id),0) quantity,(SELECT id FROM images i WHERE i.product_id=p.id ORDER BY created_at LIMIT 1) image_id,COALESCE((SELECT SUM(-delta) FROM movements m WHERE m.product_id=p.id AND m.kind='out' AND m.created_at>=datetime('now','-30 days')),0) out30,s.name supplier_name FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.business_id=? AND p.active=1 AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ? OR p.category LIKE ? OR p.brand LIKE ? OR s.name LIKE ?) ORDER BY p.name LIMIT 30 OFFSET ?",
    c.business,
    term,
    term,
    term,
    term,
    term,
    term,
    (page - 1) * 30,
  );
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
  const [warehouses, movements, low, expiry, daily, business] =
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
    hasMore: products.length === 30,
  };
}
