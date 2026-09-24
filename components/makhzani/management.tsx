"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Phone,
  Truck,
  Users,
  Warehouse,
  ScrollText,
  Wallet,
} from "lucide-react";
import {
  api,
  get,
  number,
  purchaseLabels,
  type Snapshot,
  type Product,
} from "./types";
import { Empty, ErrorBox, Field, Modal } from "./primitives";
type Row = Record<string, string | number>;
export default function Management({
  view,
  data,
  changed,
}: {
  view: string;
  data: Snapshot;
  changed: () => void;
}) {
  const [items, setItems] = useState<Row[]>([]);
  const [lines, setLines] = useState<Row[]>([]);
  const [prices, setPrices] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [productQuery, setProductQuery] = useState("");
  const [purchaseProducts, setPurchaseProducts] = useState<Product[]>(
    data.products,
  );
  const [productMatches, setProductMatches] = useState<Product[]>(
    data.products,
  );
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const loadSequence = useRef(0);
  const receiptOperationId = useRef("");
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      if (view === "warehouses") {
        await Promise.resolve();
        setItems(data.warehouses as unknown as Row[]);
        setLines([]);
        setPrices([]);
        return;
      }
      const d = await get(view);
      if (sequence !== loadSequence.current) return;
      setItems(d.items || []);
      setLines(d.lines || []);
      setPrices(d.prices || []);
      if (view === "purchases") {
        const result = await get("suppliers");
        if (sequence === loadSequence.current) setSuppliers(result.items);
      }
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [view, data.warehouses]);
  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(task);
      loadSequence.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (modal !== "purchase" || !productQuery.trim()) return;
    let active = true;
    const task = setTimeout(async () => {
      setSearchingProducts(true);
      try {
        const result = await get(
          "dashboard&q=" + encodeURIComponent(productQuery.trim()),
        );
        if (!active) return;
        setProductMatches(result.products);
        // Keep previously selected products available when searching another page.
        setPurchaseProducts((current) => [
          ...current,
          ...result.products.filter(
            (product) => !current.some((item) => item.id === product.id),
          ),
        ]);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setSearchingProducts(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(task);
    };
  }, [modal, productQuery]);
  async function run(body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(body);
      setModal(null);
      await load();
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const fields = Object.fromEntries(f.entries());
    if (modal === "purchase") {
      await run({
        type: "purchase",
        action: "create",
        supplierId: fields.supplierId,
        notes: fields.notes,
        items: Array.from({ length: lineCount }, (_, i) => ({
          productId: fields["productId" + i],
          quantity: Number(fields["quantity" + i]),
          price: Number(fields["price" + i]),
        })),
      });
    } else if (modal === "receive") {
      await run({
        type: "purchase",
        action: "receive",
        id: selected?.id,
        operationId:
          receiptOperationId.current ||
          (receiptOperationId.current = crypto.randomUUID()),
        warehouseId: fields.warehouseId,
        items: lines
          .filter(
            (l) =>
              l.purchase_id === selected?.id && Number(fields["q" + l.id]) > 0,
          )
          .map((l) => ({
            productId: l.product_id,
            quantity: Number(fields["q" + l.id]),
            price: Number(l.price) / 100,
            expires: fields["e" + l.id] || undefined,
          })),
      });
    } else if (modal === "payment") {
      await run({
        type: "payment",
        supplierId: selected?.id,
        amount: Number(fields.amount),
        note: fields.note,
      });
    } else if (modal === "cancel") {
      await run({
        type: "purchase",
        action: "status",
        id: selected?.id,
        status: "cancelled",
      });
    } else if (modal === "access") {
      await run({
        type: "members",
        email: selected?.email,
        role: selected?.role,
        active: !selected?.active,
      });
    } else
      await run({
        type: view === "suppliers" ? "supplier" : view,
        ...fields,
        role: fields.role,
        active: fields.active !== "false",
      });
  }
  const title =
    view === "suppliers"
      ? "الموردون"
      : view === "purchases"
        ? "طلبات البضاعة"
        : view === "members"
          ? "فريق العمل"
          : view === "warehouses"
            ? "المخازن والفروع"
            : "سجل العمليات";
  return (
    <>
      <div className="section-title">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            {view === "audit"
              ? "كل تغيير محفوظ: من، متى، ولماذا."
              : `${number(items.length)} ${view === "suppliers" ? "مورد" : view === "purchases" ? "طلب" : "سجل"}`}
          </p>
        </div>
        {view !== "audit" && (
          <button
            className="primary"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              setSelected(null);
              setLineCount(1);
              setSelectedProducts([]);
              setProductQuery("");
              setProductMatches(data.products);
              setSearchingProducts(false);
              setModal(view === "purchases" ? "purchase" : "create");
            }}
          >
            <Plus size={19} />
            {view === "suppliers"
              ? "إضافة مورد"
              : view === "purchases"
                ? "طلب بضاعة"
                : view === "members"
                  ? "إضافة موظف"
                  : "إضافة مخزن"}
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {loading ? (
        <div className="panel empty" role="status" aria-live="polite">
          جارٍ تحميل {title}…
        </div>
      ) : error && items.length === 0 ? (
        <Empty text="تعذر تحميل السجلات">
          <button
            type="button"
            className="secondary"
            onClick={() => void load()}
          >
            إعادة المحاولة
          </button>
        </Empty>
      ) : items.length === 0 ? (
        <Empty
          text={
            view === "suppliers"
              ? "أضف أول مورد لتنظيم مشترياتك"
              : view === "purchases"
                ? "لم تُنشأ طلبات بضاعة بعد"
                : "لا توجد سجلات بعد"
          }
        />
      ) : (
        <div className={view === "audit" ? "audit-list" : "management-grid"}>
          {items.map((item) => (
            <article className="panel management-card" key={item.id}>
              <div className="card-head">
                <span className="soft-icon">
                  {view === "suppliers" ? (
                    <Truck />
                  ) : view === "members" ? (
                    <Users />
                  ) : view === "warehouses" ? (
                    <Warehouse />
                  ) : (
                    <ScrollText />
                  )}
                </span>
                <h3>
                  {item.name || item.supplier || item.email || item.action}
                </h3>
                {item.status && (
                  <span className="badge">
                    {purchaseLabels[item.status] || item.status}
                  </span>
                )}
              </div>
              {view === "suppliers" && (
                <>
                  <p className="muted">
                    <Phone size={15} />
                    {item.phone || "لا يوجد رقم هاتف"}
                  </p>
                  <p>{item.address}</p>
                  <div className="split">
                    <span>المتبقي للمورد</span>
                    <b>{number(Number(item.debt) / 100)} ₺</b>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setSelected(item);
                      setModal("payment");
                    }}
                  >
                    <Wallet size={17} />
                    تسجيل دفعة
                  </button>
                </>
              )}
              {view === "purchases" && (
                <>
                  <p className="muted">
                    {String(item.created_at).slice(0, 10)}
                  </p>
                  {lines
                    .filter((l) => l.purchase_id === item.id)
                    .map((l) => (
                      <div key={l.id} className="split">
                        <span>{l.product}</span>
                        <b>
                          {number(Number(l.received) / 1000)} /{" "}
                          {number(Number(l.quantity) / 1000)} {l.unit}
                        </b>
                      </div>
                    ))}
                  <div className="button-row">
                    {item.status === "draft" && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "purchase",
                            action: "status",
                            id: item.id,
                            status: "sent",
                          })
                        }
                      >
                        تحديد: تم الإرسال
                      </button>
                    )}
                    {item.status === "sent" && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "purchase",
                            action: "status",
                            id: item.id,
                            status: "confirmed",
                          })
                        }
                      >
                        تأكيد الطلب
                      </button>
                    )}
                    {["confirmed", "partial"].includes(String(item.status)) && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          receiptOperationId.current = crypto.randomUUID();
                          setSelected(item);
                          setModal("receive");
                        }}
                      >
                        استلام البضاعة
                      </button>
                    )}
                    {["draft", "sent", "confirmed"].includes(
                      String(item.status),
                    ) && (
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setSelected(item);
                          setModal("cancel");
                        }}
                      >
                        إلغاء
                      </button>
                    )}
                  </div>
                </>
              )}
              {view === "members" && (
                <>
                  <p>
                    {item.role === "owner"
                      ? "المالك"
                      : item.role === "manager"
                        ? "مدير"
                        : "موظف"}{" "}
                    · {item.active ? "نشط" : "موقوف"}
                  </p>
                  {item.role !== "owner" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setSelected(item);
                        setModal("access");
                      }}
                    >
                      {item.active ? "إيقاف الوصول" : "تفعيل الوصول"}
                    </button>
                  )}
                </>
              )}
              {view === "warehouses" && <p>{item.branch}</p>}
              {view === "audit" && (
                <>
                  <small>
                    {item.created_at} · {String(item.actor).slice(0, 18)}
                  </small>
                  <p>{item.reason}</p>
                  <details>
                    <summary>التفاصيل</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          before: parseAudit(item.before),
                          after: parseAudit(item.after),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {prices.length > 0 && (
        <section className="panel">
          <h2>تاريخ أسعار الموردين</h2>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="تاريخ أسعار الموردين"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">المنتج</th>
                  <th scope="col">المورد</th>
                  <th scope="col">السعر</th>
                  <th scope="col">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id}>
                    <td>{p.product}</td>
                    <td>{p.supplier}</td>
                    <td>{number(Number(p.price) / 100)} ₺</td>
                    <td>{String(p.created_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {modal && (
        <Modal
          title={
            modal === "cancel"
              ? "إلغاء طلب البضاعة"
              : modal === "access"
                ? "تغيير صلاحية الوصول"
                : modal === "payment"
                  ? "تسجيل دفعة للمورد"
                  : modal === "receive"
                    ? "استلام البضاعة"
                    : title
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <form className="form-stack" onSubmit={submit} aria-busy={busy}>
            <fieldset className="form-stack" disabled={busy}>
              {modal === "cancel" && (
                <p>
                  سيُلغى طلب البضاعة من {selected?.supplier}. راجع الطلب قبل
                  تأكيد الإلغاء.
                </p>
              )}
              {modal === "access" && (
                <p>
                  {selected?.active
                    ? "سيُوقف وصول هذا الموظف إلى مساحة العمل."
                    : "سيُعاد تفعيل وصول هذا الموظف إلى مساحة العمل."}{" "}
                  <bdi>{selected?.email}</bdi>
                </p>
              )}
              {view === "suppliers" && modal !== "payment" && (
                <>
                  <Field label="اسم المورد *">
                    <input name="name" required />
                  </Field>
                  <Field label="الهاتف / WhatsApp">
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      dir="ltr"
                    />
                  </Field>
                  <Field label="البريد الإلكتروني">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      dir="ltr"
                    />
                  </Field>
                  <Field label="العنوان">
                    <input name="address" />
                  </Field>
                  <Field label="المعلومات الضريبية">
                    <input name="taxInfo" />
                  </Field>
                  <Field label="ملاحظات">
                    <textarea name="notes" />
                  </Field>
                </>
              )}
              {modal === "payment" && (
                <>
                  <Field label="المبلغ (₺)">
                    <input
                      name="amount"
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="ملاحظة">
                    <input name="note" />
                  </Field>
                </>
              )}
              {view === "members" && modal !== "access" && (
                <>
                  <Field label="البريد الإلكتروني لحساب الموظف">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      dir="ltr"
                      required
                    />
                  </Field>
                  <Field label="الصلاحية">
                    <select name="role">
                      <option value="employee">موظف</option>
                      <option value="manager">مدير</option>
                    </select>
                  </Field>
                  <p className="muted">
                    الدخول بالحساب المضاف. الموظف لا يرى أسعار الشراء أو
                    الموردين أو الإعدادات.
                  </p>
                </>
              )}
              {view === "warehouses" && (
                <>
                  <Field label="اسم المخزن">
                    <input name="name" required />
                  </Field>
                  <Field label="الفرع">
                    <input
                      name="branch"
                      required
                      defaultValue="الفرع الرئيسي"
                    />
                  </Field>
                </>
              )}
              {modal === "purchase" && (
                <>
                  <Field label="المورد">
                    <select name="supplierId" required>
                      <option value="">اختر المورد</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="ابحث عن منتج للطلب"
                    hint="يمكنك البحث بالاسم أو الباركود للوصول إلى جميع منتجاتك."
                  >
                    <input
                      type="search"
                      value={productQuery}
                      onChange={(event) => {
                        setSearchingProducts(!!event.target.value.trim());
                        setProductQuery(event.target.value);
                        if (!event.target.value.trim())
                          setProductMatches(purchaseProducts);
                      }}
                      placeholder="اسم المنتج أو الباركود…"
                    />
                  </Field>
                  {searchingProducts && (
                    <p className="muted" role="status">
                      جارٍ البحث عن المنتجات…
                    </p>
                  )}
                  {!searchingProducts &&
                    productQuery.trim() &&
                    !productMatches.length && (
                      <p className="muted" role="status">
                        لا توجد منتجات تطابق البحث. جرّب الاسم أو الباركود.
                      </p>
                    )}
                  {!suppliers.length && (
                    <p className="info-box">
                      أضف موردًا من قسم الموردين قبل إنشاء طلب.
                    </p>
                  )}
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div className="panel" key={i}>
                      <Field label={`المنتج ${number(i + 1)}`}>
                        <select
                          name={"productId" + i}
                          required
                          value={selectedProducts[i] || ""}
                          onChange={(event) =>
                            setSelectedProducts((current) => {
                              const next = [...current];
                              next[i] = event.target.value;
                              return next;
                            })
                          }
                        >
                          <option value="">اختر المنتج</option>
                          {[
                            ...productMatches,
                            ...purchaseProducts.filter(
                              (product) =>
                                product.id === selectedProducts[i] &&
                                !productMatches.some(
                                  (match) => match.id === product.id,
                                ),
                            ),
                          ].map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.unit}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="form-grid">
                        <Field label="الكمية">
                          <input
                            name={"quantity" + i}
                            type="number"
                            step="0.001"
                            min="0.001"
                            inputMode="decimal"
                            required
                          />
                        </Field>
                        <Field label="سعر الوحدة (₺)">
                          <input
                            name={"price" + i}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            required
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                  <div className="button-row">
                    <button
                      className="secondary"
                      type="button"
                      disabled={lineCount >= 30}
                      onClick={() => setLineCount((n) => Math.min(30, n + 1))}
                    >
                      إضافة منتج للطلب
                    </button>
                    {lineCount > 1 && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setLineCount((n) => n - 1);
                          setSelectedProducts((current) =>
                            current.slice(0, lineCount - 1),
                          );
                        }}
                      >
                        إزالة آخر سطر
                      </button>
                    )}
                  </div>
                  <Field label="ملاحظات">
                    <textarea name="notes" />
                  </Field>
                </>
              )}
              {modal === "receive" && (
                <>
                  <Field label="مخزن الاستلام">
                    <select name="warehouseId" required>
                      {data.warehouses.map((w) => (
                        <option value={w.id} key={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {lines
                    .filter((l) => l.purchase_id === selected?.id)
                    .map((l) => (
                      <div className="panel form-grid" key={l.id}>
                        <Field
                          label={String(l.product) + " — الكمية المستلمة"}
                          hint={`الوحدة: ${l.unit}`}
                        >
                          <input
                            name={"q" + l.id}
                            type="number"
                            min="0"
                            step="0.001"
                            inputMode="decimal"
                            max={
                              (Number(l.quantity) - Number(l.received)) / 1000
                            }
                            defaultValue={
                              (Number(l.quantity) - Number(l.received)) / 1000
                            }
                          />
                        </Field>
                        <Field label="الصلاحية إن وجدت">
                          <input name={"e" + l.id} type="date" />
                        </Field>
                      </div>
                    ))}
                </>
              )}
            </fieldset>
            <ErrorBox error={error} />
            <button disabled={busy} className="primary">
              {busy
                ? "جارٍ الحفظ…"
                : modal === "cancel"
                  ? "تأكيد إلغاء الطلب"
                  : "تأكيد وحفظ"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function parseAudit(value: string | number | undefined) {
  try {
    return JSON.parse(String(value || "null"));
  } catch {
    return value || null;
  }
}
