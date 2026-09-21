import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("drizzle/" + f, "utf8"));
  db.exec(
    "INSERT INTO businesses(id,name,owner) VALUES('b','Store','u'),('other','Other','u2'); INSERT INTO warehouses(id,business_id,name) VALUES('w','b','Main'),('w2','b','Branch'),('alien','other','Other'); INSERT INTO products(id,business_id,name,barcode,sku) VALUES('p','b','Water','100','100'); INSERT INTO operations(id,business_id,actor,kind,fingerprint) VALUES('op','b','u','in','{}'); INSERT INTO batches(id,business_id,product_id,warehouse_id,lot) VALUES('batch','b','p','w','A'),('batch2','b','p','w2','A');",
  );
  return db;
}
function move(
  db,
  id,
  delta,
  batch = "batch",
  warehouse = "w",
  expected = null,
  kind = "in",
) {
  return db
    .prepare(
      "INSERT INTO movements(id,business_id,operation_id,product_id,warehouse_id,batch_id,delta,expected,kind,actor) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
    .run(id, "b", "op", "p", warehouse, batch, delta, expected, kind, "u");
}
const balance = (db) =>
  db.prepare("SELECT quantity FROM batches WHERE id='batch'").get().quantity;
test("migrations, ledger and balance are consistent", () => {
  const d = fixture();
  move(d, "in", 10000);
  move(d, "out", -3000, "batch", "w", null, "out");
  assert.equal(balance(d), 7000);
  assert.equal(d.prepare("SELECT SUM(delta) q FROM movements").get().q, 7000);
  d.close();
});
test("database rejects negative stock", () => {
  const d = fixture();
  move(d, "in", 1000);
  assert.throws(() => move(d, "bad", -1001), /negative stock/);
  assert.equal(balance(d), 1000);
});
test("concurrent-style stale withdrawal cannot oversell", () => {
  const d = fixture();
  move(d, "in", 10000);
  move(d, "first", -7000);
  assert.throws(() => move(d, "second", -7000));
  assert.equal(balance(d), 3000);
});
test("stale stock count rejected after new receipt", () => {
  const d = fixture();
  move(d, "in", 10000);
  move(d, "new", 2000);
  assert.throws(
    () => move(d, "count", -2000, "batch", "w", 10000, "count"),
    /stale stock/,
  );
  assert.equal(balance(d), 12000);
});
test("count with expected quantity accepted", () => {
  const d = fixture();
  move(d, "in", 20000);
  move(d, "count", -2000, "batch", "w", 20000, "count");
  assert.equal(balance(d), 18000);
});
test("transfer is balanced", () => {
  const d = fixture();
  move(d, "in", 10000);
  d.exec("BEGIN");
  move(d, "from", -4000, "batch", "w", null, "transfer");
  move(d, "to", 4000, "batch2", "w2", null, "transfer");
  d.exec("COMMIT");
  assert.equal(balance(d), 6000);
  assert.equal(d.prepare("SELECT SUM(quantity) q FROM batches").get().q, 10000);
});
test("transaction rollback removes half transfer", () => {
  const d = fixture();
  move(d, "in", 10000);
  d.exec("BEGIN");
  try {
    move(d, "from", -4000);
    move(d, "bad", 4000, "batch2", "alien");
    d.exec("COMMIT");
  } catch {
    d.exec("ROLLBACK");
  }
  assert.equal(balance(d), 10000);
});
test("cross-tenant movement rejected", () => {
  const d = fixture();
  assert.throws(() => move(d, "bad", 1000, "batch", "alien"), /scope mismatch/);
});
test("barcode duplicate is constrained", () => {
  const d = fixture();
  assert.throws(
    () =>
      d.exec(
        "INSERT INTO products(id,business_id,name,barcode,sku) VALUES('p2','b','Other','100','101')",
      ),
    /UNIQUE/,
  );
});
test("ledger is append-only", () => {
  const d = fixture();
  move(d, "a", 1000);
  assert.throws(() => d.exec("DELETE FROM movements"), /immutable/);
  assert.throws(() => d.exec("UPDATE movements SET delta=0"), /immutable/);
});
test("audit is append-only", () => {
  const d = fixture();
  d.exec(
    "INSERT INTO audit_logs(id,business_id,actor,action,entity) VALUES('a','b','u','in','p')",
  );
  assert.throws(() => d.exec("DELETE FROM audit_logs"), /immutable/);
  assert.throws(() => d.exec("UPDATE audit_logs SET action='x'"), /immutable/);
});
test("expired stock cannot be sold", () => {
  const d = fixture();
  move(d, "in", 5000);
  d.exec("UPDATE batches SET expires='2020-01-01' WHERE id='batch'");
  assert.throws(
    () => move(d, "out", -1000, "batch", "w", null, "out"),
    /expired/,
  );
  move(d, "discard", -5000, "batch", "w", null, "damaged");
  assert.equal(balance(d), 0);
});
test("receipt cannot exceed purchase amount", () => {
  const d = fixture();
  d.exec(
    "INSERT INTO suppliers(id,business_id,name) VALUES('s','b','S'); INSERT INTO purchases(id,business_id,supplier_id,status) VALUES('po','b','s','confirmed'); INSERT INTO purchase_items(id,purchase_id,product_id,quantity,price) VALUES('i','po','p',10000,100)",
  );
  d.exec("UPDATE purchase_items SET received=6000 WHERE id='i'");
  assert.throws(
    () =>
      d.exec("UPDATE purchase_items SET received=received+6000 WHERE id='i'"),
    /CHECK/,
  );
  assert.equal(
    d.prepare("SELECT received FROM purchase_items").get().received,
    6000,
  );
});
test("cancelled purchase cannot be received", () => {
  const d = fixture();
  d.exec(
    "INSERT INTO suppliers(id,business_id,name) VALUES('s','b','S'); INSERT INTO purchases(id,business_id,supplier_id,status) VALUES('po','b','s','cancelled'); INSERT INTO purchase_items(id,purchase_id,product_id,quantity,price) VALUES('i','po','p',10000,100)",
  );
  assert.throws(
    () => d.exec("UPDATE purchase_items SET received=1000"),
    /stale purchase/,
  );
});
test("operation id unique prevents duplicate receipt", () => {
  const d = fixture();
  assert.throws(
    () =>
      d.exec(
        "INSERT INTO operations(id,business_id,actor,kind,fingerprint) VALUES('op','b','u','in','{}')",
      ),
    /UNIQUE/,
  );
});
test("two real concurrent connections serialize withdrawals", async () => {
  const { Worker } = await import("node:worker_threads");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "makhzani-test-"));
  const file = join(dir, "race.sqlite");
  const d = fixture();
  move(d, "initial", 10000);
  d.prepare("VACUUM INTO ?").run(file);
  d.close();
  const code = `const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(workerData.file);d.exec('PRAGMA busy_timeout=5000');parentPort.postMessage('ready');parentPort.once('message',()=>{try{d.exec('BEGIN IMMEDIATE');d.prepare("INSERT INTO movements(id,business_id,operation_id,product_id,warehouse_id,batch_id,delta,kind,actor) VALUES(?,'b','op','p','w','batch',-7000,'out','u')").run(workerData.id);d.exec('COMMIT');parentPort.postMessage('ok');}catch(e){try{d.exec('ROLLBACK')}catch{}parentPort.postMessage(e.message);}finally{d.close()}});`;
  const workers = [0, 1].map(
    (i) =>
      new Worker(code, { eval: true, workerData: { file, id: "race-" + i } }),
  );
  await Promise.all(
    workers.map(
      (w) =>
        new Promise((resolve, reject) => {
          w.once("message", resolve);
          w.once("error", reject);
        }),
    ),
  );
  const results = await Promise.all(
    workers.map(
      (w) =>
        new Promise((resolve, reject) => {
          w.once("message", resolve);
          w.once("error", reject);
          w.postMessage("start");
        }),
    ),
  );
  assert.equal(results.filter((r) => r === "ok").length, 1);
  assert.ok(results.some((r) => String(r).includes("negative stock")));
  const check = new DatabaseSync(file);
  assert.equal(balance(check), 3000);
  check.close();
  await Promise.all(workers.map((w) => w.terminate()));
  rmSync(dir, { recursive: true, force: true });
});
