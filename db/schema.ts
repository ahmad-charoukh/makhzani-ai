import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
const now = () =>
  text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);
export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner: text("owner").notNull().unique(),
  createdAt: now(),
});
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    active: integer("active").notNull().default(1),
  },
  (t) => [
    uniqueIndex("member_email").on(t.businessId, t.email),
    check("member_role", sql`${t.role} IN ('owner','manager','employee')`),
  ],
);
export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  name: text("name").notNull(),
  branch: text("branch").notNull().default("الفرع الرئيسي"),
});
export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone").default(""),
  email: text("email").default(""),
  address: text("address").default(""),
  taxInfo: text("tax_info").default(""),
  notes: text("notes").default(""),
  createdAt: now(),
});
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    barcode: text("barcode").notNull(),
    sku: text("sku").notNull(),
    category: text("category").notNull().default("عام"),
    subcategory: text("subcategory").default(""),
    brand: text("brand").default(""),
    description: text("description").default(""),
    unit: text("unit").notNull().default("قطعة"),
    minimum: integer("minimum").notNull().default(5000),
    purchasePrice: integer("purchase_price").notNull().default(0),
    sellingPrice: integer("selling_price").notNull().default(0),
    tax: real("tax").notNull().default(0),
    supplierId: text("supplier_id").references(() => suppliers.id),
    shelf: text("shelf").default(""),
    notes: text("notes").default(""),
    expiryEnabled: integer("expiry_enabled").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex("barcode_business").on(t.businessId, t.barcode),
    uniqueIndex("sku_business").on(t.businessId, t.sku),
    index("product_search").on(t.businessId, t.active, t.name),
    check(
      "prices_nonnegative",
      sql`${t.purchasePrice}>=0 AND ${t.sellingPrice}>=0 AND ${t.minimum}>=0`,
    ),
  ],
);
export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: now(),
});
export const batches = sqliteTable(
  "batches",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    lot: text("lot").notNull(),
    expires: text("expires"),
    quantity: integer("quantity").notNull().default(0),
    createdAt: now(),
  },
  (t) => [
    index("batch_fefo").on(t.businessId, t.productId, t.warehouseId, t.expires),
    check("batch_nonnegative", sql`${t.quantity}>=0`),
  ],
);
export const operations = sqliteTable("operations", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  actor: text("actor").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull().default(""),
  fingerprint: text("fingerprint").notNull(),
  createdAt: now(),
});
export const movements = sqliteTable(
  "movements",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    operationId: text("operation_id")
      .notNull()
      .references(() => operations.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id),
    delta: integer("delta").notNull(),
    expected: integer("expected"),
    kind: text("kind").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason").notNull().default(""),
    invoice: text("invoice").default(""),
    createdAt: now(),
  },
  (t) => [
    index("movement_reporting").on(t.businessId, t.createdAt),
    index("movement_product").on(t.businessId, t.productId, t.createdAt),
  ],
);
export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  status: text("status").notNull().default("draft"),
  notes: text("notes").default(""),
  createdAt: now(),
});
export const purchaseItems = sqliteTable(
  "purchase_items",
  {
    id: text("id").primaryKey(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchases.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    received: integer("received").notNull().default(0),
    price: integer("price").notNull(),
  },
  (t) => [
    check(
      "receive_bounds",
      sql`${t.received}>=0 AND ${t.received}<=${t.quantity}`,
    ),
  ],
);
export const prices = sqliteTable("supplier_prices", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  price: integer("price").notNull(),
  createdAt: now(),
});
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  amount: integer("amount").notNull(),
  note: text("note"),
  createdAt: now(),
});
export const audits = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    before: text("before"),
    after: text("after"),
    reason: text("reason").default(""),
    ip: text("ip"),
    createdAt: now(),
  },
  (t) => [index("audit_business").on(t.businessId, t.createdAt)],
);
export const settings = sqliteTable("settings", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id),
  units: text("units").notNull().default("[]"),
  currency: text("currency").notNull().default("TRY"),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  window: integer("window").notNull(),
  count: integer("count").notNull(),
});
