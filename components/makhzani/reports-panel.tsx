"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Printer, RotateCcw } from "lucide-react";
import { ErrorBox, Empty, Field } from "./primitives";
import { number, kindLabels, readApiResponse, type Movement, type Snapshot } from "./types";
const StockChart = dynamic(() => import("./stock-chart"), { ssr: false });
type Report = {
  summary: {
    incoming: number;
    outgoing: number;
    counts: number;
    operations: number;
  };
  valuation: { value: number };
  daily: Snapshot["daily"];
  movements: Movement[];
  losses: {
    name: string;
    unit: string;
    kind: string;
    quantity: number;
    estimated_value: number;
  }[];
  suppliers: {
    name: string;
    orders: number;
    ordered_value: number;
    received_value: number;
  }[];
  hasMore: boolean;
  options: {
    warehouses: { id: string; name: string }[];
    categories: string[];
    suppliers: { id: string; name: string }[];
  };
};
const date = (d: Date) => d.toISOString().slice(0, 10);
export default function ReportsPanel() {
  const [from, setFrom] = useState(() =>
    date(new Date(Date.now() - 29 * 86400000)),
  );
  const [to, setTo] = useState(() => date(new Date()));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", warehouse: "", category: "", supplier: "" });
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [exportMessage, setExportMessage] = useState("");
  const query = new URLSearchParams({ from, to, ...filters }).toString();
  function refresh() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }
  function filter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    refresh();
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        if (!from || !to || from > to) throw Error("اختر تاريخ بداية ونهاية صحيحين");
        const response = await fetch(`/api/inventory?view=reports&${query}&page=${page}`, { signal: controller.signal });
        const result = await readApiResponse<Report>(response, "تعذر تحميل التقرير");
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof TypeError ? "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا." : error instanceof Error ? error.message : "تعذر تحميل التقرير");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page, revision, from, to]);
  async function exportMovements() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportMessage("");
    try {
      const response = await fetch(`/api/export?kind=movements&${query}`);
      if (!response.ok || !response.headers.get("Content-Type")?.includes("text/csv")) {
        await readApiResponse(response, "تعذر تصدير التقرير");
        throw Error("تعذر تصدير التقرير");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `makhzani-movements-${from}-${to}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("تم تجهيز ملف الحركات وفق عوامل التصفية المحددة");
    } catch (error) {
      setExportMessage(error instanceof TypeError ? "تعذر التصدير. تحقق من الاتصال وحاول مجددًا." : error instanceof Error ? error.message : "تعذر تصدير التقرير");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }
  function period(days: number) {
    setTo(date(new Date()));
    setFrom(date(new Date(Date.now() - (days - 1) * 86400000)));
    setPage(1);
    refresh();
  }
  return (
    <>
      <div className="section-title">
        <div>
          <h1>تقارير المخزون</h1>
          <p className="muted">حركة المخزون والمشتريات من بياناتك الفعلية، ضمن الفترة والنطاق الذي تختاره.</p>
        </div>
        <div className="button-row">
          <button
            className="secondary"
            disabled={loading || !!error || exporting}
            onClick={() => void exportMovements()}
          >
            <Download size={18} />
            {exporting ? "جارٍ التصدير…" : "تصدير الحركات"}
          </button>
          <button className="primary" disabled={loading || !!error} onClick={() => window.print()}>
            <Printer size={18} />
            طباعة / PDF
          </button>
        </div>
      </div>
      {exportMessage && <p className="muted" role="status">{exportMessage}</p>}
      <section className="panel">
        <div className="button-row">
          {[
            [1, "اليوم"],
            [7, "آخر أسبوع"],
            [30, "آخر شهر"],
          ].map(([n, label]) => (
            <button
              key={n}
              className="secondary"
              onClick={() => period(Number(n))}
              aria-pressed={to === date(new Date()) && from === date(new Date(Date.now() - (Number(n) - 1) * 86400000))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="من تاريخ">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
                setLoading(true);
              }}
            />
          </Field>
          <Field label="إلى تاريخ">
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
                setLoading(true);
              }}
            />
          </Field>
          <Field label="بحث عن منتج">
            <input type="search" value={filters.q} maxLength={100} placeholder="الاسم أو SKU أو الباركود" onChange={(event) => filter("q", event.target.value)} />
          </Field>
          <Field label="المستودع">
            <select value={filters.warehouse} onChange={(event) => filter("warehouse", event.target.value)}>
              <option value="">كل المستودعات</option>
              {data?.options.warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="الفئة">
            <select value={filters.category} onChange={(event) => filter("category", event.target.value)}>
              <option value="">كل الفئات</option>
              {data?.options.categories.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="المورد">
            <select value={filters.supplier} onChange={(event) => filter("supplier", event.target.value)}>
              <option value="">كل الموردين</option>
              {data?.options.suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </Field>
        </div>
        {Object.values(filters).some(Boolean) && <button className="secondary" onClick={() => { setFilters({ q: "", warehouse: "", category: "", supplier: "" }); setPage(1); refresh(); }}><RotateCcw size={16} />مسح عوامل التصفية</button>}
        <p className="muted">قيمة المخزون تعكس الرصيد الحالي ولا تتأثر بالفترة. فلتر المورد للحركات والأرصدة يعتمد على المورد المسجل حاليًا للمنتج.</p>
      </section>
      <ErrorBox error={error} />
      {error && <button className="secondary" onClick={refresh}>إعادة المحاولة</button>}
      {loading && (
        <p className="muted" role="status">
          جارٍ تحديث التقرير…
        </p>
      )}
      {data && !error && !loading && (
        <>
          <div className="stats-grid">
            {[
              ["دخل", data.summary.incoming / 1000],
              ["خرج", data.summary.outgoing / 1000],
              ["عمليات جرد", data.summary.counts],
              ["قيمة المخزون الحالية", data.valuation.value],
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <span>{label}</span>
                <strong>{number(Number(value))}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>الحركة خلال الفترة</h2>
            {data.daily.length ? (
              <StockChart daily={data.daily} />
            ) : (
              <Empty text="لا توجد حركات خلال هذه الفترة" />
            )}
          </section>
          <section className="panel">
            <h2>التالف والضائع</h2>
            <p className="muted">
              القيمة تقديرية وفق سعر الشراء المسجل حاليًا.
            </p>
            {data.losses.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>السبب</th>
                      <th>الكمية</th>
                      <th>القيمة التقريبية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.losses.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{kindLabels[r.kind]}</td>
                        <td>
                          {number(r.quantity / 1000)} {r.unit}
                        </td>
                        <td>{number(r.estimated_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">لا يوجد تالف أو ضائع مسجل.</p>
            )}
          </section>
          <section className="panel">
            <h2>المشتريات حسب المورد</h2>
            <p className="muted">
              طلبات غير ملغاة أنشئت خلال الفترة، مع قيمة بنود المنتجات المطابقة وما استُلم منها حتى الآن. طلبات الشراء غير مرتبطة بمستودع، لذا يشمل هذا القسم كل المستودعات.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>المورد</th>
                    <th>عدد الطلبات</th>
                    <th>قيمة الطلبات</th>
                    <th>المستلم حتى الآن</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td>{s.orders}</td>
                      <td>{number(s.ordered_value)}</td>
                      <td>{number(s.received_value)}</td>
                    </tr>
                  ))}
                  {!data.suppliers.length && <tr><td colSpan={4}><Empty text="لا توجد مشتريات مطابقة للفترة وعوامل التصفية" /></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>تفاصيل الحركات</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الحركة</th>
                    <th>الكمية</th>
                    <th>المخزن</th>
                    <th>المستخدم</th>
                    <th>الملاحظات</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{kindLabels[m.kind]}</td>
                      <td>
                        {number(m.delta / 1000)} {m.unit}
                      </td>
                      <td>{m.warehouse}</td>
                      <td>{m.actor}</td>
                      <td>{m.reason || "—"}</td>
                      <td>{m.created_at}</td>
                    </tr>
                  ))}
                  {!data.movements.length && <tr><td colSpan={7}><Empty text="لا توجد حركات مطابقة للفترة وعوامل التصفية" /></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>صفحة {number(page)}</span>
              <div className="button-row">
                <button
                  disabled={page === 1}
                  onClick={() => {
                    setPage((n) => n - 1);
                    setLoading(true);
                  }}
                >
                  السابق
                </button>
                <button
                  disabled={!data.hasMore}
                  onClick={() => {
                    setPage((n) => n + 1);
                    setLoading(true);
                  }}
                >
                  التالي
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
