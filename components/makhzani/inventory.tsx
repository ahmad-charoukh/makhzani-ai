"use client";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Download,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Empty, Field, ProductIcon } from "./primitives";
import {
  inventoryDefaults,
  number,
  type InventoryFilters,
  type Product,
  type Snapshot,
} from "./types";

type InventoryProps = {
  data: Snapshot;
  q: string;
  setQ: (value: string) => void;
  page: number;
  setPage: (value: number) => void;
  loading: boolean;
  filters: InventoryFilters;
  setFilters: (value: InventoryFilters) => void;
  onAction: (kind: string, product: Product) => void;
  onDetails: (product: Product) => void;
  onAdd: () => void;
  onScan: () => void;
  onExport: () => void;
};

function StockBadge({ product }: { product: Product }) {
  const state =
    product.quantity === 0
      ? "empty"
      : product.quantity <= product.minimum
        ? "low"
        : "available";
  return (
    <span
      className={
        "badge " +
        (state === "empty"
          ? "danger-badge"
          : state === "low"
            ? "warning"
            : "success")
      }
    >
      <span className="status-dot" aria-hidden="true" />
      {state === "empty"
        ? "نفد المخزون"
        : state === "low"
          ? "مخزون منخفض"
          : "متوفر"}
    </span>
  );
}

export function Inventory({
  data,
  q,
  setQ,
  page,
  setPage,
  loading,
  filters,
  setFilters,
  onAction,
  onDetails,
  onAdd,
  onScan,
  onExport,
}: InventoryProps) {
  const isEmployee = data.role === "employee";
  const hasFilters = Boolean(
    q ||
    filters.category ||
    filters.warehouse ||
    filters.stock !== "all" ||
    filters.sort !== "name-asc",
  );
  const categories =
    data.categories ||
    [...new Set(data.products.map((product) => product.category))].filter(
      Boolean,
    );
  const currentPage = data.page || page;
  const total = data.totalProducts ?? data.products.length;
  const warehouse = data.warehouses.find(
    (item) => item.id === filters.warehouse,
  );
  const updateFilter = <K extends keyof InventoryFilters>(
    key: K,
    value: InventoryFilters[K],
  ) => {
    setPage(1);
    setFilters({ ...filters, [key]: value });
  };
  const reset = () => {
    setPage(1);
    setQ("");
    setFilters({ ...inventoryDefaults });
  };
  const actions = (product: Product) => (
    <div className="button-row inventory-card-actions">
      <button
        className="table-action"
        title="إدخال بضاعة"
        aria-label={"إدخال بضاعة: " + product.name}
        disabled={loading}
        onClick={() => onAction("in", product)}
      >
        <ArrowDownToLine size={17} />
        <span>إدخال</span>
      </button>
      <button
        className="table-action"
        title="إخراج بضاعة"
        aria-label={"إخراج بضاعة: " + product.name}
        disabled={loading || product.quantity === 0}
        onClick={() => onAction("out", product)}
      >
        <ArrowUpFromLine size={17} />
        <span>إخراج</span>
      </button>
      <button
        className="table-action"
        title="جرد المخزون"
        aria-label={"جرد المخزون: " + product.name}
        disabled={loading}
        onClick={() => onAction("count", product)}
      >
        <ClipboardCheck size={17} />
        <span>جرد</span>
      </button>
    </div>
  );
  const productLink = (product: Product) => (
    <button
      className="product-cell"
      disabled={loading}
      onClick={() => onDetails(product)}
      aria-label={"عرض تفاصيل " + product.name}
    >
      <ProductIcon p={product} />
      <span>
        <b>{product.name}</b>
        <small dir="ltr">{product.sku || product.barcode}</small>
      </span>
    </button>
  );
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">إدارة المنتجات</span>
          <h1>المخزون</h1>
          <p className="muted">
            كل منتج في مكانه. ابحث، راجع الكميات، وحرّك البضاعة.
          </p>
        </div>
        {!isEmployee && (
          <button className="primary" onClick={onAdd}>
            <Plus size={18} />
            إضافة منتج
          </button>
        )}
      </div>
      <section
        className="panel inventory-panel"
        aria-label="قائمة المخزون"
        aria-busy={loading}
      >
        <div className="inventory-toolbar">
          <div className="search-field">
            <Search size={19} aria-hidden="true" />
            <input
              aria-label="البحث في المخزون"
              placeholder="ابحث بالاسم، الباركود، الرمز أو المورد…"
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
            />
            {q && (
              <button
                className="search-clear"
                aria-label="مسح البحث"
                onClick={() => {
                  setPage(1);
                  setQ("");
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button className="secondary" onClick={onScan}>
            <ScanLine size={18} />
            <span>مسح باركود</span>
          </button>
          {!isEmployee && (
            <button
              className="secondary inventory-export"
              onClick={onExport}
              disabled={loading}
              aria-label="تصدير المخزون بصيغة CSV"
            >
              <Download size={18} />
              <span>تصدير</span>
            </button>
          )}
        </div>
        <div className="inventory-filters">
          <Field label="التصنيف">
            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
            >
              <option value="">كل التصنيفات</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="حالة المخزون">
            <select
              value={filters.stock}
              onChange={(event) =>
                updateFilter(
                  "stock",
                  event.target.value as InventoryFilters["stock"],
                )
              }
            >
              <option value="all">كل الحالات</option>
              <option value="available">متوفر</option>
              <option value="low">مخزون منخفض</option>
              <option value="empty">نفد المخزون</option>
            </select>
          </Field>
          <Field label="المخزن">
            <select
              value={filters.warehouse}
              onChange={(event) =>
                updateFilter("warehouse", event.target.value)
              }
            >
              <option value="">كل المخازن</option>
              {data.warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ترتيب المنتجات">
            <select
              value={filters.sort}
              onChange={(event) =>
                updateFilter(
                  "sort",
                  event.target.value as InventoryFilters["sort"],
                )
              }
            >
              <option value="name-asc">الاسم: تصاعدي</option>
              <option value="name-desc">الاسم: تنازلي</option>
              <option value="quantity-asc">الكمية: الأقل أولًا</option>
              <option value="quantity-desc">الكمية: الأعلى أولًا</option>
              <option value="price-asc">سعر البيع: الأقل أولًا</option>
              <option value="price-desc">سعر البيع: الأعلى أولًا</option>
            </select>
          </Field>
        </div>
        <div className="inventory-results">
          <span role="status" aria-live="polite">
            <SlidersHorizontal size={15} aria-hidden="true" />
            {loading ? "جارٍ تحديث المنتجات…" : `${number(total)} منتج`}
            {warehouse ? ` · الكميات في ${warehouse.name}` : " · جميع المخازن"}
          </span>
          {hasFilters && (
            <button className="text-button inventory-reset" onClick={reset}>
              <RotateCcw size={14} />
              إعادة ضبط
            </button>
          )}
        </div>
        {loading && !data.products.length ? (
          <div className="inventory-skeleton" aria-label="جارٍ تحميل المخزون">
            {Array.from({ length: 5 }, (_, i) => (
              <div className="skeleton inventory-skeleton-row" key={i} />
            ))}
          </div>
        ) : data.products.length ? (
          <>
            <div className="table-scroll inventory-table">
              <table>
                <caption className="sr-only">
                  المنتجات وكمياتها وأسعارها وإجراءات المخزون
                </caption>
                <thead>
                  <tr>
                    <th scope="col">المنتج</th>
                    <th scope="col">التصنيف</th>
                    <th scope="col">الكمية</th>
                    <th scope="col">الحالة</th>
                    {!isEmployee && <th scope="col">سعر الشراء</th>}
                    <th scope="col">سعر البيع</th>
                    <th scope="col">إجراء سريع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((product) => (
                    <tr key={product.id}>
                      <td>{productLink(product)}</td>
                      <td>
                        <span className="category-tag">
                          {product.category || "عام"}
                        </span>
                      </td>
                      <td>
                        <div className="inventory-quantity">
                          <b>
                            {number(product.quantity / 1000)}{" "}
                            <small>{product.unit}</small>
                          </b>
                          <small className="muted">
                            الحد الأدنى: {number(product.minimum / 1000)}
                          </small>
                        </div>
                      </td>
                      <td>
                        <StockBadge product={product} />
                      </td>
                      {!isEmployee && (
                        <td className="numeric">
                          {product.purchase_price === undefined
                            ? "—"
                            : number(product.purchase_price / 100)}{" "}
                          <small>₺</small>
                        </td>
                      )}
                      <td className="numeric">
                        {number(product.selling_price / 100)} <small>₺</small>
                      </td>
                      <td>{actions(product)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inventory-mobile">
              {data.products.map((product) => (
                <article className="inventory-card" key={product.id}>
                  <div className="inventory-card-top">
                    {productLink(product)}
                    <StockBadge product={product} />
                  </div>
                  <div className="inventory-card-category">
                    <span className="category-tag">
                      {product.category || "عام"}
                    </span>
                    <span className="muted">{product.barcode}</span>
                  </div>
                  <dl className="inventory-card-meta">
                    <div>
                      <dt>الكمية المتاحة</dt>
                      <dd>
                        {number(product.quantity / 1000)}{" "}
                        <small>{product.unit}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>الحد الأدنى</dt>
                      <dd>
                        {number(product.minimum / 1000)}{" "}
                        <small>{product.unit}</small>
                      </dd>
                    </div>
                    {!isEmployee && (
                      <div>
                        <dt>سعر الشراء</dt>
                        <dd>
                          {product.purchase_price === undefined
                            ? "—"
                            : number(product.purchase_price / 100)}{" "}
                          <small>₺</small>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>سعر البيع</dt>
                      <dd>
                        {number(product.selling_price / 100)} <small>₺</small>
                      </dd>
                    </div>
                  </dl>
                  {actions(product)}
                </article>
              ))}
            </div>
          </>
        ) : (
          <Empty
            text={
              hasFilters ? "لا توجد منتجات تطابق البحث" : "ابدأ بإضافة أول منتج"
            }
          >
            <p className="muted">
              {hasFilters
                ? "جرّب كلمة أخرى أو أعد ضبط الفلاتر لعرض المنتجات."
                : "أضف معلومات المنتج، ثم سجّل الكمية الموجودة في مخزنك."}
            </p>
            {hasFilters ? (
              <button className="secondary" onClick={reset}>
                <RotateCcw size={17} />
                إعادة ضبط البحث
              </button>
            ) : (
              !isEmployee && (
                <button className="primary" onClick={onAdd}>
                  <Plus size={17} />
                  إضافة منتج
                </button>
              )
            )}
          </Empty>
        )}
        <div className="pagination">
          <span>
            {total > 0
              ? `عرض ${number((currentPage - 1) * 30 + 1)}–${number((currentPage - 1) * 30 + data.products.length)} من ${number(total)}`
              : "لا توجد منتجات"}
            <small className="pagination-page">
              الصفحة {number(currentPage)}
              {data.pageCount ? ` من ${number(data.pageCount)}` : ""}
            </small>
          </span>
          <div className="button-row">
            <button
              disabled={loading || currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              السابق
            </button>
            <button
              disabled={loading || !data.hasMore}
              onClick={() => setPage(currentPage + 1)}
            >
              التالي
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

export default Inventory;
