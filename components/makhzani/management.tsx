"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Phone,
  Truck,
  Users,
  Warehouse,
  ScrollText,
  Wallet,
} from "lucide-react";
import { api, get, number, purchaseLabels, type Snapshot } from "./types";
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
  const load = useCallback(async () => {
    try {
      if (view === "warehouses") {
        await Promise.resolve();
        setItems(data.warehouses as unknown as Row[]);
        return;
      }
      const d = await get(view);
      setItems(d.items || []);
      setLines(d.lines || []);
      setPrices(d.prices || []);
      if (view === "purchases") setSuppliers((await get("suppliers")).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [view, data.warehouses]);
  useEffect(() => {
    const task = setTimeout(() => void load(), 0);
    return () => clearTimeout(task);
  }, [load]);
  async function run(body: unknown) {
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
        operationId: crypto.randomUUID(),
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
            onClick={() => {
              setSelected(null);
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
      {items.length === 0 ? (
        <Empty text="لا توجد سجلات بعد" />
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
                  <span className="badge">{purchaseLabels[item.status]}</span>
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
                    onClick={() => {
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
                        onClick={() => {
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
                        onClick={() =>
                          run({
                            type: "purchase",
                            action: "status",
                            id: item.id,
                            status: "cancelled",
                          })
                        }
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
                      onClick={() =>
                        run({
                          type: "members",
                          email: item.email,
                          role: item.role,
                          active: !item.active,
                        })
                      }
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
                          before: JSON.parse(String(item.before || "null")),
                          after: JSON.parse(String(item.after || "null")),
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
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>المورد</th>
                  <th>السعر</th>
                  <th>التاريخ</th>
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
            modal === "payment"
              ? "تسجيل دفعة للمورد"
              : modal === "receive"
                ? "استلام البضاعة"
                : title
          }
          close={() => setModal(null)}
        >
          <form className="form-stack" onSubmit={submit}>
            {view === "suppliers" && modal !== "payment" && (
              <>
                <Field label="اسم المورد *">
                  <input name="name" required />
                </Field>
                <Field label="الهاتف / WhatsApp">
                  <input name="phone" dir="ltr" />
                </Field>
                <Field label="البريد الإلكتروني">
                  <input name="email" type="email" />
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
                <Field label="المبلغ">
                  <input
                    name="amount"
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                </Field>
                <Field label="ملاحظة">
                  <input name="note" />
                </Field>
              </>
            )}
            {view === "members" && (
              <>
                <Field label="البريد الإلكتروني لحساب الموظف">
                  <input name="email" type="email" required />
                </Field>
                <Field label="الصلاحية">
                  <select name="role">
                    <option value="employee">موظف</option>
                    <option value="manager">مدير</option>
                  </select>
                </Field>
                <p className="muted">
                  الدخول بالحساب المضاف. الموظف لا يرى أسعار الشراء أو الموردين
                  أو الإعدادات.
                </p>
              </>
            )}
            {view === "warehouses" && (
              <>
                <Field label="اسم المخزن">
                  <input name="name" required />
                </Field>
                <Field label="الفرع">
                  <input name="branch" required defaultValue="الفرع الرئيسي" />
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
                {Array.from({ length: lineCount }, (_, i) => (
                  <div className="panel" key={i}>
                    <Field label="المنتج">
                      <select name={"productId" + i} required>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
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
                          required
                        />
                      </Field>
                      <Field label="سعر الوحدة">
                        <input
                          name={"price" + i}
                          type="number"
                          step="0.01"
                          min="0"
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
                    onClick={() => setLineCount((n) => Math.min(30, n + 1))}
                  >
                    إضافة منتج للطلب
                  </button>
                  {lineCount > 1 && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setLineCount((n) => n - 1)}
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
                  <select name="warehouseId">
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
                      <Field label={String(l.product) + " — الكمية المستلمة"}>
                        <input
                          name={"q" + l.id}
                          type="number"
                          min="0"
                          step="0.001"
                          max={(Number(l.quantity) - Number(l.received)) / 1000}
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
            <ErrorBox error={error} />
            <button disabled={busy} className="primary">
              {busy ? "جارٍ الحفظ…" : "تأكيد وحفظ"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
