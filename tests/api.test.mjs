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
globalThis.__makhzaniTest = {
  DB: {
    prepare: (q) => new Prepared(q),
    batch: async (queries) => {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const q of queries) result.push(await q.run());
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
  entryPoints: ["app/api/inventory/route.ts"],
  outfile: ".sites-runtime/tests/api.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
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
      for (const view of ["suppliers", "members", "purchases", "audit"])
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
});
