// Explicit local demo fixtures. Never called during deployment.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
if (!process.argv.includes("--local"))
  throw Error("Use --local; production seeding is deliberately unsupported");
const email = process.env.DEMO_EMAIL || "owner@example.test";
if (!/^[\w.+-]+@[\w.-]+$/.test(email)) throw Error("Invalid DEMO_EMAIL");
const products = [
  ["مياه معدنية", "مشروبات", "كرتون", 24, 5, 85, 100],
  ["زيت دوار الشمس", "مواد غذائية", "لتر", 18, 6, 60, 75],
  ["سكر أبيض", "مواد غذائية", "كغم", 4, 10, 30, 40],
  ["أرز بسمتي", "مواد غذائية", "كغم", 40, 8, 55, 70],
  ["عصير برتقال", "مشروبات", "علبة", 0, 12, 15, 20],
  ["سائل تنظيف", "منظفات", "قطعة", 30, 5, 35, 45],
];
let sql = `INSERT INTO businesses(id,name,owner) VALUES('demo-business','متجر تجريبي','demo-owner'); INSERT INTO members(id,business_id,email,role) VALUES('demo-member','demo-business','${email}','owner'); INSERT INTO warehouses(id,business_id,name) VALUES('demo-main','demo-business','المخزن الرئيسي'); INSERT INTO settings(business_id) VALUES('demo-business');`;
products.forEach(([name, category, unit, quantity, minimum, buy, sell], i) => {
  sql += `INSERT INTO products(id,business_id,name,barcode,sku,category,unit,minimum,purchase_price,selling_price) VALUES('demo-p${i}','demo-business','${name}','62800000000${i}','DEMO-${i}','${category}','${unit}',${minimum * 1000},${buy * 100},${sell * 100}); INSERT INTO operations(id,business_id,actor,kind,fingerprint) VALUES('demo-op${i}','demo-business','demo-owner','in','seed-${i}'); INSERT INTO batches(id,business_id,product_id,warehouse_id,lot) VALUES('demo-b${i}','demo-business','demo-p${i}','demo-main','DEMO'); INSERT INTO movements(id,business_id,operation_id,product_id,warehouse_id,batch_id,delta,kind,actor) VALUES('demo-m${i}','demo-business','demo-op${i}','demo-p${i}','demo-main','demo-b${i}',${quantity * 1000},'in','demo-owner');`;
});
mkdirSync(".sites-runtime", { recursive: true });
writeFileSync(".sites-runtime/seed.sql", sql);
const r = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    ".sites-runtime/seed.sql",
  ],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
