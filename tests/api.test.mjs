import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("drizzle-kit"))("esbuild");
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
class Prepared {
  constructor(query, args = []) {
    this.query = query;
    this.args = args;
  }
  bind(...args) {
    return new Prepared(this.query, args);
  }
  async first() {
    return sql.prepare(this.query).get(...this.args) || null;
  }
  async all() {
    return {
      results: sql.prepare(this.query).all(...this.args),
      success: true,
    };
  }
  async run() {
    return sql.prepare(this.query).run(...this.args);
  }
}
const objects = new Map();
let beforePut = async () => {};
globalThis.__makhzaniTest = {
  BUCKET: {
    put: async (key, bytes) => {
      await beforePut();
      objects.set(key, bytes);
    },
    get: async (key) => (objects.has(key) ? { body: objects.get(key) } : null),
    delete: async (key) => {
      objects.delete(key);
    },
  },
  DB: {
    prepare: (q) => new Prepared(q),
    batch: async (queries) => {
      sql.exec("BEGIN");
      try {
        const result = [];
        // D1 batches serialize their entire transaction; do not yield between statements.
        for (const q of queries)
          result.push(sql.prepare(q.query).run(...q.args));
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  },
  headers: new Headers(),
};
mkdirSync(".sites-runtime/tests", { recursive: true });
await build({
  stdin: {
    contents:
      'export {GET,POST} from "./app/api/inventory/route"; export {GET as exportCSV} from "./app/api/export/route"; export {stockStatements} from "./lib/stock"; export {context} from "./lib/server"; export {POST as uploadImage} from "./app/api/images/route"; export {GET as readImage} from "./app/api/images/[id]/route";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: ".sites-runtime/tests/api.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/supabase-storage$/ }, () => ({
          path: "storage",
          namespace: "test-storage",
        }));
        b.onLoad({ filter: /.*/, namespace: "test-storage" }, () => ({
          contents: `const storage=globalThis.__makhzaniTest.BUCKET;
            export const storagePath=(business,id)=>business+"/"+id;
            export const putImage=(path,bytes)=>storage.put(path,bytes);
            export const deleteImage=path=>storage.delete(path);
            export const getImage=async path=>{const value=await storage.get(path);return value?new Blob([value.body]):null;};`,
          loader: "js",
        }));
        b.onResolve(
          { filter: /^cloudflare:workers$|^next\/headers$|^next\/navigation$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents:
            args.path === "cloudflare:workers"
              ? "export const env=globalThis.__makhzaniTest;"
              : args.path === "next/headers"
                ? "export const headers=async()=>globalThis.__makhzaniTest.headers;"
                : 'export const redirect=()=>{throw Error("redirect")}',
          loader: "js",
        }));
      },
    },
  ],
});
const route = await import(
  pathToFileURL(resolve(".sites-runtime/tests/api.mjs"))
);
const owner = "owner@example.test";
let who = owner;
async function call(body, view = "dashboard") {
  globalThis.__makhzaniTest.headers = new Headers(
    who
      ? {
          "oai-authenticated-user-id": "id-" + who,
          "oai-authenticated-user-email": who,
        }
      : {},
  );
  const request = new Request("https://test.local/api/inventory?view=" + view, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "https://test.local",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = await (body ? route.POST(request) : route.GET(request));
  return { status: response.status, data: await response.json() };
}
const id = () => crypto.randomUUID();
let warehouse, product, supplier, po;
test("API complete warehouse workflow", async (t) => {
  await t.test("unauthenticated request denied", async () => {
    who = null;
    assert.equal((await call()).status, 401);
    who = owner;
  });
  await t.test("setup and login identity", async () => {
    assert.equal(
      (await call({ type: "setup", name: "Test Shop" })).status,
      200,
    );
    const r = await call();
    assert.equal(r.data.role, "owner");
    warehouse = r.data.warehouses[0].id;
  });
  await t.test("create product and reject duplicate barcode", async () => {
    const p = {
      type: "product",
      name: "مياه",
      barcode: "6281000001",
      sku: "WATER",
      purchasePrice: 10,
      sellingPrice: 15,
    };
    const r = await call(p);
    assert.equal(r.status, 200);
    product = r.data.id;
    assert.equal((await call({ ...p, sku: "WATER2" })).status, 409);
  });
  await t.test("stock in with idempotent retry", async () => {
    const b = {
      type: "stock",
      id: id(),
      productId: product,
      warehouseId: warehouse,
      kind: "in",
      quantity: 20,
    };
    assert.equal((await call(b)).status, 200);
    assert.equal((await call(b)).data.repeated, true);
    assert.equal((await call()).data.products[0].quantity, 20000);
  });
  await t.test("stock out and negative protection", async () => {
    assert.equal(
      (
        await call({
          type: "stock",
          id: id(),
          productId: product,
          warehouseId: warehouse,
          kind: "out",
          quantity: 25,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call({
          type: "stock",
          id: id(),
          productId: product,
          warehouseId: warehouse,
          kind: "out",
          quantity: 3,
        })
      ).status,
      200,
    );
    assert.equal((await call()).data.products[0].quantity, 17000);
  });
  await t.test("count updates and stale expected blocked", async () => {
    const b = {
      type: "stock",
      id: id(),
      productId: product,
      warehouseId: warehouse,
      kind: "count",
      quantity: 15,
      expected: 17,
      reason: "Physical count",
    };
    assert.equal((await call(b)).status, 200);
    assert.equal((await call({ ...b, id: id() })).status, 409);
  });
  await t.test("supplier and purchase", async () => {
    const s = await call({ type: "supplier", name: "المورد الأول" });
    supplier = s.data.id;
    const p = await call({
      type: "purchase",
      action: "create",
      supplierId: supplier,
      items: [{ productId: product, quantity: 10, price: 9 }],
    });
    assert.equal(p.status, 200);
    po = p.data.id;
    for (const status of ["sent", "confirmed"])
      assert.equal(
        (await call({ type: "purchase", action: "status", id: po, status }))
          .status,
        200,
      );
  });
  await t.test("partial and complete receipt", async () => {
    for (const quantity of [4, 6])
      assert.equal(
        (
          await call({
            type: "purchase",
            action: "receive",
            id: po,
            operationId: id(),
            warehouseId: warehouse,
            items: [{ productId: product, quantity, price: 9 }],
          })
        ).status,
        200,
      );
    assert.equal(
      (await call(undefined, "purchases")).data.items[0].status,
      "received",
    );
    assert.equal((await call()).data.products[0].quantity, 25000);
  });
  await t.test("low stock summary", async () => {
    await call({
      type: "stock",
      id: id(),
      productId: product,
      warehouseId: warehouse,
      kind: "out",
      quantity: 22,
    });
    assert.equal((await call()).data.low[0].id, product);
  });
  await t.test("assistant read and draft only", async () => {
    const before = (await call()).data.products[0].quantity;
    const a = await call({ type: "assistant", question: "دخل 10 مياه" });
    assert.equal(a.data.draft.quantity, 10);
    assert.equal((await call()).data.products[0].quantity, before);
  });
  await t.test(
    "employee cannot access prices, suppliers, team or edit product",
    async () => {
      await call({
        type: "members",
        email: "employee@example.test",
        role: "employee",
      });
      who = "employee@example.test";
      const r = await call();
      assert.equal(r.data.products[0].purchase_price, undefined);
      assert.equal(r.data.stats.value, undefined);
      for (const view of [
        "suppliers",
        "members",
        "purchases",
        "audit",
        "reports",
      ])
        assert.equal((await call(undefined, view)).status, 403);
      assert.equal(
        (await call({ type: "product", name: "Wrong", barcode: "z", sku: "z" }))
          .status,
        403,
      );
      who = owner;
    },
  );
  await t.test("audit includes previous and new quantities", async () => {
    const r = await call(undefined, "audit");
    assert.equal(r.status, 200);
    assert.ok(
      r.data.items.some(
        (i) =>
          i.action === "count" &&
          JSON.parse(i.before).quantity === 17 &&
          JSON.parse(i.after).quantity === 15,
      ),
    );
  });
  await t.test(
    "report dates, summary and CSV use the same inclusive period",
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const r = await call(undefined, `reports&from=${today}&to=${today}`);
      assert.equal(r.status, 200);
      assert.equal(r.data.summary.incoming, 30000);
      assert.equal(r.data.summary.outgoing, 25000);
      assert.equal(r.data.summary.counts, 1);
      assert.equal(r.data.suppliers[0].received_value, 90);
      const empty = await call(
        undefined,
        "reports&from=2000-01-01&to=2000-01-01",
      );
      assert.equal(empty.data.summary.incoming, 0);
      assert.equal(empty.data.movements.length, 0);
      for (const query of [
        "from=2026-02-30",
        "from=2026-03-02&to=2026-03-01",
        "from=2020-01-01&to=2026-01-01",
      ])
        assert.equal((await call(undefined, "reports&" + query)).status, 400);
      const csv = await route.exportCSV(
        new Request(
          `https://test.local/api/export?kind=movements&from=${today}&to=${today}`,
        ),
      );
      assert.equal(csv.status, 200);
      assert.match(await csv.text(), /مياه/);
      const old = await route.exportCSV(
        new Request(
          "https://test.local/api/export?kind=movements&from=2000-01-01&to=2000-01-01",
        ),
      );
      assert.doesNotMatch(await old.text(), /مياه/);
    },
  );
  await t.test(
    "stock audits read committed totals when operations were planned concurrently",
    async () => {
      const c = await route.context();
      const input = {
        productId: product,
        warehouseId: warehouse,
        kind: "in",
        quantity: 2,
        reason: "",
        invoice: "",
      };
      const a = { ...input, id: id() },
        b = { ...input, id: id() };
      // Both plans observe three units; the second commits after the first.
      const first = await route.stockStatements(c, a);
      const second = await route.stockStatements(c, b);
      for (const [op, queries] of [
        [a, first],
        [b, second],
      ]) {
        await globalThis.__makhzaniTest.DB.batch([
          new Prepared(
            "INSERT INTO operations(id,business_id,actor,kind,reason,fingerprint) VALUES(?,?,?,?,?,?)",
            [op.id, c.business, c.actor, op.kind, "", JSON.stringify(op)],
          ),
          ...queries,
        ]);
      }
      const audits = sql
        .prepare(
          "SELECT before,after FROM audit_logs WHERE entity=? AND action='in' ORDER BY rowid DESC LIMIT 2",
        )
        .all(product);
      assert.equal(JSON.parse(audits[0].before).quantity, 5);
      assert.equal(JSON.parse(audits[0].after).quantity, 7);
      assert.equal(JSON.parse(audits[1].before).quantity, 3);
      assert.equal(JSON.parse(audits[1].after).quantity, 5);
    },
  );
  await t.test("foreign business cannot read or mutate product", async () => {
    who = "other@example.test";
    await call({ type: "setup", name: "Other" });
    assert.equal((await call(undefined, "detail&id=" + product)).status, 404);
    assert.equal(
      (
        await call({
          type: "stock",
          id: id(),
          productId: product,
          warehouseId: warehouse,
          kind: "in",
          quantity: 2,
        })
      ).status,
      404,
    );
    who = owner;
  });
  await t.test("purchase prices reject excess precision", async () => {
    assert.equal(
      (
        await call({
          type: "purchase",
          action: "create",
          supplierId: supplier,
          items: [{ productId: product, quantity: 1, price: 1.123 }],
        })
      ).status,
      400,
    );
  });
  await t.test(
    "private uploads validate MIME and enforce eight images even with concurrent uploads",
    async () => {
      await call(); // restore the owner's trusted request identity
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      );
      async function upload(bytes = png, mime = "image/png") {
        const f = new FormData();
        f.set("productId", product);
        f.set("file", new File([bytes], "photo.png", { type: mime }));
        return route.uploadImage(
          new Request("https://test.local/api/images", {
            method: "POST",
            headers: { origin: "https://test.local" },
            body: f,
          }),
        );
      }
      assert.equal((await upload(Buffer.from("<svg></svg>"))).status, 400);
      assert.equal((await upload(png, "image/jpeg")).status, 400);
      let imageId;
      for (let i = 0; i < 7; i++) {
        const response = await upload();
        assert.equal(response.status, 200);
        imageId = (await response.json()).id;
      }
      const found = await route.readImage(
        new Request("https://test.local/api/images/" + imageId),
        { params: Promise.resolve({ id: imageId }) },
      );
      assert.equal(found.status, 200);
      assert.equal(found.headers.get("content-type"), "image/png");
      assert.deepEqual(Buffer.from(await found.arrayBuffer()), png);
      let waiting = 0,
        release;
      const barrier = new Promise((r) => {
        release = r;
      });
      beforePut = async () => {
        if (++waiting === 2) release();
        await barrier;
      };
      const result = await Promise.all([upload(), upload()]);
      beforePut = async () => {};
      assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
      assert.equal(objects.size, 8);
      who = "employee@example.test";
      await call();
      assert.equal((await upload()).status, 403);
      who = "other@example.test";
      await call();
      assert.equal(
        (
          await route.readImage(
            new Request("https://test.local/api/images/" + imageId),
            { params: Promise.resolve({ id: imageId }) },
          )
        ).status,
        404,
      );
      who = owner;
      await call();
    },
  );
  await t.test("CSRF origin rejected", async () => {
    const r = await route.POST(
      new Request("https://test.local/api/inventory", {
        method: "POST",
        headers: {
          origin: "https://evil.test",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(r.status, 403);
  });
  await t.test("invalid quantities rejected", async () => {
    assert.equal(
      (
        await call({
          type: "stock",
          id: id(),
          productId: product,
          warehouseId: warehouse,
          kind: "in",
          quantity: -2,
        })
      ).status,
      400,
    );
  });
  await t.test(
    "inventory filters and sorting apply before pagination",
    async () => {
      const business = sql
        .prepare("SELECT business_id FROM members WHERE email=?")
        .get(owner).business_id;
      const insert = sql.prepare(
        "INSERT INTO products(id,business_id,name,barcode,sku,category,minimum,purchase_price,selling_price) VALUES(?,?,?,?,?,?,?,?,?)",
      );
      const fixtureIds = [];
      for (let i = 1; i <= 61; i++) {
        const productId = id();
        fixtureIds.push(productId);
        insert.run(
          productId,
          business,
          "UX Fixture " +
            String(i).padStart(3, "0") +
            (i === 61 ? " 100%" : ""),
          "UX-" + i,
          "UX-SKU-" + i,
          i === 61 ? "Other fixture" : "Inventory fixture",
          5000,
          100,
          i * 100,
        );
      }
      const query = (params) =>
        call(undefined, "inventory&" + new URLSearchParams(params));
      const filter = { q: "UX Fixture", category: "Inventory fixture" };
      const first = await query(filter);
      assert.equal(first.status, 200);
      assert.equal(first.data.products.length, 30);
      assert.equal(first.data.totalProducts, 60);
      assert.equal(first.data.hasMore, true);
      assert.equal(first.data.pageCount, 2);
      assert.ok(first.data.categories.includes("Other fixture"));
      const last = (await query({ ...filter, page: "2" })).data;
      assert.equal(last.products.length, 30);
      assert.equal(
        last.hasMore,
        false,
        "exactly 30 remaining products is the last page",
      );
      const beyond = (await query({ ...filter, page: "9999" })).data;
      assert.equal(beyond.page, 2);
      assert.equal((await query({ ...filter, page: "1.9" })).data.page, 1);
      const reverse = (await query({ ...filter, sort: "price-desc" })).data;
      assert.equal(reverse.products[0].id, fixtureIds[59]);
      assert.equal(reverse.products.at(-1).id, fixtureIds[30]);
      const missing = (
        await query({ q: "no-matching-inventory-fixture", page: "6" })
      ).data;
      assert.equal(missing.totalProducts, 0);
      assert.equal(missing.page, 1);
      assert.equal(missing.hasMore, false);
      assert.equal(
        (await query({ q: "%" })).data.products[0].id,
        fixtureIds[60],
      );
      assert.equal(
        (await query({ q: "_" })).data.totalProducts,
        0,
        "search treats SQL wildcard characters literally",
      );
      const safeSort = await query({
        ...filter,
        sort: "selling_price; DROP TABLE products",
      });
      assert.equal(safeSort.status, 200);
      assert.equal(safeSort.data.products[0].id, fixtureIds[0]);
      assert.equal((await query({ ...filter, sort: "toString" })).status, 200);

      const secondWarehouse = (
        await call({
          type: "warehouses",
          name: "Secondary fixture",
          branch: "Test branch",
        })
      ).data.id;
      for (const [productId, warehouseId, quantity] of [
        [fixtureIds[59], warehouse, 9],
        [fixtureIds[59], secondWarehouse, 2],
        [fixtureIds[58], warehouse, 3],
      ]) {
        assert.equal(
          (
            await call({
              type: "stock",
              id: id(),
              kind: "in",
              productId,
              warehouseId,
              quantity,
            })
          ).status,
          200,
        );
      }
      const available = (
        await query({ ...filter, stock: "available", sort: "quantity-desc" })
      ).data;
      assert.equal(available.totalProducts, 1);
      assert.equal(available.products[0].quantity, 11000);
      const low = (await query({ ...filter, stock: "low" })).data;
      assert.equal(low.totalProducts, 1);
      assert.equal(low.products[0].id, fixtureIds[58]);
      assert.equal(
        (await query({ ...filter, stock: "empty" })).data.totalProducts,
        58,
      );
      const warehouseLow = (
        await query({ ...filter, warehouse: secondWarehouse, stock: "low" })
      ).data;
      assert.equal(warehouseLow.totalProducts, 1);
      assert.equal(warehouseLow.products[0].id, fixtureIds[59]);
      assert.equal(warehouseLow.products[0].quantity, 2000);
      assert.equal(
        (await query({ ...filter, warehouse: secondWarehouse, stock: "empty" }))
          .data.totalProducts,
        59,
      );
      const foreignWarehouse = sql
        .prepare("SELECT id FROM warehouses WHERE business_id!=?")
        .get(business).id;
      assert.equal((await query({ warehouse: foreignWarehouse })).status, 404);
      who = "employee@example.test";
      const employee = (await query({ ...filter, stock: "available" })).data;
      assert.equal(employee.products[0].purchase_price, undefined);
      who = "other@example.test";
      assert.equal((await query(filter)).data.totalProducts, 0);
      who = owner;
    },
  );
});
