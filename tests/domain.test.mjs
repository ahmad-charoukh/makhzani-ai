import test from "node:test";
import assert from "node:assert/strict";
import {
  scaled,
  allocate,
  reorder,
  allowed,
  normalize,
  statusTransitions,
} from "../lib/domain.ts";
test("quantities use exact thousandths", () => {
  assert.equal(scaled(1.235), 1235);
  assert.equal(scaled(0), 0);
  assert.equal(scaled(1000.001), 1000001);
});
for (const n of [-1, NaN, Infinity, 0.00001, 1e10])
  test("reject invalid quantity " + n, () => assert.throws(() => scaled(n)));
test("allocation preserves FEFO order and splits batches", () => {
  const b = [
    { id: "early", quantity: 5000 },
    { id: "late", quantity: 8000 },
  ];
  assert.deepEqual(
    allocate(b, 7000).map((p) => [p.batch.id, p.amount]),
    [
      ["early", 5000],
      ["late", 2000],
    ],
  );
  assert.equal(b[0].quantity, 5000);
});
test("no overselling", () =>
  assert.throws(() => allocate([{ id: "a", quantity: 1000 }], 1001)));
test("reorder predicts three days", () =>
  assert.deepEqual(reorder(15000, 150000, 5000), {
    daily: 5,
    days: 3,
    suggested: 55,
  }));
test("no fabricated prediction for new product", () =>
  assert.equal(reorder(0, 0, 5000).days, null));
test("employees cannot access costs, users or configuration", () => {
  for (const a of [
    "products",
    "suppliers",
    "purchases",
    "reports",
    "members",
    "settings",
    "warehouses",
  ])
    assert.equal(allowed("employee", a), false);
  for (const a of ["read", "stock", "count", "assistant", "images.read"])
    assert.equal(allowed("employee", a), true);
});
test("manager cannot manage owner settings or team", () => {
  assert.equal(allowed("manager", "members"), false);
  assert.equal(allowed("manager", "settings"), false);
  assert.equal(allowed("manager", "products"), true);
});
test("Arabic normalization", () =>
  assert.equal(normalize("أَرْز"), normalize("ارز")));
test("received purchases cannot return to draft", () =>
  assert.deepEqual(statusTransitions.received, []));
