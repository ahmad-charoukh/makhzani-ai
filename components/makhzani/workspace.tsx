"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Package,
  LayoutDashboard,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Truck,
  ShoppingBag,
  ChartNoAxesCombined,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  Plus,
  Sparkles,
  ArrowLeftRight,
  ScanLine,
  Menu,
  LogOut,
  ShieldCheck,
  Users,
  Warehouse,
  History,
  TriangleAlert,
  RefreshCw,
  Download,
  Mic,
  Send,
  WifiOff,
  CheckCircle2,
  FileText,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  api,
  get,
  number,
  kindLabels,
  type Product,
  type Snapshot,
} from "./types";
import { Empty, ErrorBox, Field, Modal, ProductIcon } from "./primitives";
const ProductForm=dynamic(()=>import("./product-form"),{ssr:false});
const StockForm=dynamic(()=>import("./stock-form"),{ssr:false});
const Management=dynamic(()=>import("./management"),{ssr:false});
const ProductDetails=dynamic(()=>import("./product-details"),{ssr:false});
const Scanner=dynamic(()=>import("./scanner"),{ssr:false});
const StockChart=dynamic(()=>import("./stock-chart"),{ssr:false});
const navigation = [
  ["dashboard", "نظرة عامة", LayoutDashboard],
  ["inventory", "المخزون", Boxes],
  ["movements", "حركة البضاعة", ArrowLeftRight],
  ["low", "شو ناقص؟", TriangleAlert],
  ["purchases", "طلبات البضاعة", ShoppingBag],
  ["suppliers", "الموردون", Truck],
  ["reports", "التقارير", ChartNoAxesCombined],
  ["warehouses", "المخازن والفروع", Warehouse],
  ["members", "فريق العمل", Users],
  ["audit", "سجل العمليات", History],
  ["settings", "الإعدادات", Settings],
] as const;
type Message = {
  text: string;
  mine?: boolean;
  draft?: { productId: string; quantity: number; kind: string };
};
export default function Workspace() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [view, setView] = useState("dashboard");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | undefined>();
  const [barcode, setBarcode] = useState("");
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [offline, setOffline] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { text: "أهلًا! اسألني عن مخزونك، النواقص، أو حركة اليوم." },
  ]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState<
    { productId: string; quantity: number; kind: string } | undefined
  >();
  const [locale, setLocale] = useState("ar");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        "/api/inventory?q=" + encodeURIComponent(q) + "&page=" + page,
      );
      const d = (await r.json()) as Snapshot & { error?: string };
      if (!r.ok) {
        setAuth(r.status);
        if (r.status === 401 || r.status === 403) {
          setData(null);
          sessionStorage.removeItem("mk-cache");
        }
        throw Error(d.error);
      }
      setAuth(0);
      setData(d);
      setError("");
      sessionStorage.setItem("mk-cache", JSON.stringify(d));
    } catch (e) {
      setError((e as Error).message);
      if (!navigator.onLine) {
        const cached = sessionStorage.getItem("mk-cache");
        if (cached) setData(JSON.parse(cached));
      }
    } finally {
      setLoading(false);
    }
  }, [q, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const nav = (v: string) => {
    setView(v);
    setMenu(false);
    setPage(1);
    setQ("");
  };
  const saved = () => {
    setModal(null);
    setSelected(undefined);
    setDraft(undefined);
    setToast(
      navigator.onLine ? "تم الحفظ بنجاح" : "حُفظت مسودة للمراجعة عند الاتصال",
    );
    void load();
  };
  const action = (kind: string, p?: Product) => {
    setSelected(p);
    setDraft(p ? { productId: p.id, quantity: 0, kind } : undefined);
    setModal(kind);
  };
  async function ask(text = question) {
    if (!text.trim() || thinking) return;
    setQuestion("");
    setMessages((m) => [...m, { text, mine: true }]);
    setThinking(true);
    try {
      const r = await api({ type: "assistant", question: text });
      setMessages((m) => [...m, { text: r.text, draft: r.draft }]);
    } catch (e) {
      setMessages((m) => [...m, { text: (e as Error).message }]);
    } finally {
      setThinking(false);
    }
  }
  function voice() {
    type SpeechResult = { results: { transcript: string }[][] };
    type Speech = {
      lang: string;
      start: () => void;
      onresult: (e: SpeechResult) => void;
      onerror: () => void;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Speech;
      webkitSpeechRecognition?: new () => Speech;
    };
    const S = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!S) {
      setToast("الإملاء الصوتي غير مدعوم هنا، استخدم ميكروفون لوحة المفاتيح.");
      return;
    }
    const s = new S();
    s.lang = locale === "ar" ? "ar-SA" : locale === "tr" ? "tr-TR" : "en-US";
    s.onresult = (e) => {
      setQuestion(e.results[0][0].transcript);
    };
    s.onerror = () => setToast("تعذر التقاط الصوت");
    s.start();
  }
  function exportCSV() {
    const link=document.createElement('a');link.href='/api/export';link.download='makhzani-stock.csv';link.click();
  }

  const tr = (ar: string, en: string, tr: string) =>
    locale === "ar" ? ar : locale === "tr" ? tr : en;
  if (!data)
    return (
      <main className="welcome" dir="rtl">
        <div className="welcome-brand">
          <Package size={35} />
          <b>
            مخزني<span>MAKHZANI AI</span>
          </b>
        </div>
        <section className="welcome-card">
          <span className="eyebrow">كل شيء في مكانه</span>
          <h1>
            مخزونك واضح.
            <br />
            ويومك أبسط.
          </h1>
          <p>أدخل البضاعة، تابع الكميات، واعرف شو ناقص — من مكان واحد.</p>
          {loading ? (
            <div className="loading-bar" />
          ) : auth === 401 ? (
            <a
              className="primary"
              href="/signin-with-chatgpt?return_to=%2F"
              target="_top"
            >
              تسجيل الدخول بأمان <ChevronLeft size={18} />
            </a>
          ) : auth === 403 ? (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await api({ type: "setup", name: f.get("name") });
                  void load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Field label="اسم المحل أو النشاط">
                <input name="name" placeholder="مثال: متجر البركة" required />
              </Field>
              <button className="primary">إنشاء مخزني</button>
              <small>
                إذا كنت موظفًا، اطلب من المالك إضافة بريد حسابك ثم حدّث الصفحة.
              </small>
            </form>
          ) : (
            <>
              <ErrorBox error={error} />
              <button className="secondary" onClick={() => load()}>
                إعادة المحاولة
              </button>
            </>
          )}
          <div className="welcome-foot">
            <ShieldCheck size={17} />
            بيانات دائمة · صلاحيات واضحة · سجل لكل حركة
          </div>
        </section>
        <div className="welcome-side">
          <div className="orbit">
            <Boxes size={96} />
          </div>
          <h2>
            بضاعة أكثر تنظيمًا.
            <br />
            قرارات أكثر وضوحًا.
          </h2>
          <div className="welcome-pills">
            <span>إدخال</span>
            <span>إخراج</span>
            <span>جرد</span>
          </div>
        </div>
      </main>
    );
  const isEmployee = data.role === "employee";
  const visibleNav = navigation
    .filter(
      ([key]) =>
        !isEmployee ||
        ["dashboard", "inventory", "movements", "low"].includes(key),
    )
    .filter(
      ([key]) =>
        data.role === "owner" || !["members", "settings"].includes(key),
    );
  return (
    <div className="app-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            nav("dashboard");
          }}
        >
          <span className="brand-icon">
            <Package size={29} />
          </span>
          <b>
            مخزني<small>MAKHZANI AI</small>
          </b>
        </a>
        <div className="business-switch">
          <span className="store-avatar">{data.business.name.slice(0, 1)}</span>
          <div>
            <strong>{data.business.name}</strong>
            <small>مساحة العمل</small>
          </div>
          <ChevronLeft size={16} />
        </div>
        <small className="nav-label">إدارة مخزونك</small>
        <nav>
          {visibleNav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => nav(key)}
            >
              <Icon size={20} />
              <span>{label}</span>
              {key === "low" && data.low.length > 0 && (
                <em>{data.low.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="ai-shortcut" onClick={() => setModal("assistant")}>
            <Sparkles size={20} />
            <span>
              مساعد مخزني<small>اسأل. افهم. قرر.</small>
            </span>
            <ChevronLeft size={17} />
          </button>
          <div className="account">
            <span className="avatar">
              {data.email.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>
                {data.role === "owner"
                  ? "صاحب المخزن"
                  : data.role === "manager"
                    ? "مدير المخزن"
                    : "الموظف"}
              </b>
              <small>{data.email}</small>
            </span>
            <a
              aria-label="تسجيل الخروج"
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
              onClick={() => sessionStorage.removeItem("mk-cache")}
            >
              <LogOut size={17} />
            </a>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="إغلاق القائمة"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="فتح القائمة"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>مساحة العمل</span>
            <ChevronLeft size={14} />
            <b>{navigation.find((n) => n[0] === view)?.[1]}</b>
          </div>
          <div className="topbar-actions">
            <span className="today">
              {new Date().toLocaleDateString("ar", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <select
              aria-label="لغة التنقل"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
            <button
              className="icon-button notification-button"
              aria-label="التنبيهات"
              onClick={() => nav("low")}
            >
              <Bell size={20} />
              {data.low.length + data.expiry.length > 0 && <i />}
            </button>
          </div>
        </header>
        <main className="content">
          {offline && (
            <div className="info-box">
              <WifiOff size={19} />
              أنت دون اتصال. البيانات المعروضة آخر نسخة، والعمليات تُحفظ
              كمسودات.
            </div>
          )}
          <ErrorBox error={error} />
          {view === "dashboard" && (
            <>
              <div className="section-title">
                <div>
                  <div className="eyebrow">
                    {tr(
                      "كل شيء تحت السيطرة",
                      "Everything in view",
                      "Her şey kontrol altında",
                    )}
                  </div>
                  <h1>
                    {tr(
                      "أهلًا، يومك اليوم أسهل 👋",
                      "Your day, made simpler 👋",
                      "Bugün işler daha kolay 👋",
                    )}
                  </h1>
                  <p className="muted">
                    {tr(
                      "هاي نظرة سريعة على مخزونك. شو بدنا نعمل اليوم؟",
                      "A clear view of your stock. What’s next?",
                      "Stoğuna hızlı bir bakış. Bugün ne yapalım?",
                    )}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setModal("scanner")}
                >
                  <ScanLine size={20} />
                  مسح باركود
                </button>
              </div>
              <div className="stats-grid">
                {[
                  [
                    Boxes,
                    "إجمالي المنتجات",
                    data.stats.products,
                    "منتج في مخزونك",
                    "blue",
                  ],
                  [
                    Package,
                    "إجمالي الكميات",
                    data.stats.quantity / 1000,
                    "مجموع وحدات المنتجات",
                    "violet",
                  ],
                  [
                    TriangleAlert,
                    "قاربت على النفاد",
                    data.stats.low,
                    "تحتاج متابعة",
                    "amber",
                  ],
                  [
                    ShoppingBag,
                    "نفد من المخزون",
                    data.stats.empty,
                    "منتجات تحتاج طلب",
                    "red",
                  ],
                ].map(([Icon, label, value, sub, color]) => {
                  const I = Icon as typeof Boxes;
                  return (
                    <div key={String(label)} className="stat-card">
                      <div className="split">
                        <span>{String(label)}</span>
                        <span className={"stat-icon " + color}>
                          <I size={21} />
                        </span>
                      </div>
                      <strong>{number(Number(value))}</strong>
                      <small>{String(sub)}</small>
                    </div>
                  );
                })}
              </div>
              <section className="quick-section">
                <h2>شو بدنا نعمل؟</h2>
                <div className="quick-grid">
                  {[
                    [
                      "in",
                      "إدخال بضاعة",
                      "وصلت بضاعة جديدة",
                      ArrowDownToLine,
                      "green",
                    ],
                    [
                      "out",
                      "إخراج بضاعة",
                      "بيع أو استخدام",
                      ArrowUpFromLine,
                      "blue",
                    ],
                    [
                      "count",
                      "جرد سريع",
                      "تأكد من الكميات",
                      ClipboardCheck,
                      "violet",
                    ],
                    [
                      "inventory",
                      "المخزون",
                      "كل منتجاتك بمكان",
                      Boxes,
                      "orange",
                    ],
                    ...(!isEmployee
                      ? [
                          [
                            "purchases",
                            "طلب بضاعة",
                            "جهّز طلبك للمورد",
                            ShoppingBag,
                            "pink",
                          ],
                        ]
                      : []),
                    [
                      "assistant",
                      "اسأل المساعد",
                      "جواب من مخزونك",
                      Sparkles,
                      "teal",
                    ],
                  ].map(([key, title, sub, Icon, color]) => {
                    const I = Icon as typeof Boxes;
                    return (
                      <button
                        key={String(key)}
                        className={"quick-action " + color}
                        onClick={() =>
                          ["inventory", "purchases"].includes(String(key))
                            ? nav(String(key))
                            : setModal(String(key))
                        }
                      >
                        <span className="quick-icon">
                          <I size={25} />
                        </span>
                        <b>{String(title)}</b>
                        <small>{String(sub)}</small>
                        <ChevronLeft className="quick-arrow" size={16} />
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="dashboard-columns">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>شو صار بالمخزن؟</h2>
                      <p className="muted">حركة البضاعة خلال آخر 30 يوم</p>
                    </div>
                    <span className="badge neutral">آخر 30 يوم</span>
                  </div>
                  {data.daily.length ? (
                    <StockChart daily={data.daily}/>
                  ) : (
                    <Empty text="ابدأ بأول حركة بضاعة">
                      <p>ستظهر حركة مخزونك هنا تلقائيًا.</p>
                      <button
                        className="secondary"
                        onClick={() => setModal("in")}
                      >
                        إدخال بضاعة
                      </button>
                    </Empty>
                  )}
                  <div className="chart-legend">
                    <span>
                      <i className="green-dot" />
                      البضاعة الداخلة
                    </span>
                    <span>
                      <i className="blue-dot" />
                      البضاعة الخارجة
                    </span>
                  </div>
                </section>
                <section className="panel low-panel">
                  <div className="panel-heading">
                    <h2>
                      شو ناقص اليوم؟{" "}
                      <span className="count-badge">{data.low.length}</span>
                    </h2>
                    <button className="text-button" onClick={() => nav("low")}>
                      عرض الكل <ChevronLeft size={14} />
                    </button>
                  </div>
                  {data.low.length ? (
                    data.low.slice(0, 4).map((p) => (
                      <div className="low-row" key={p.id}>
                        <ProductIcon p={p} />
                        <div>
                          <b>{p.name}</b>
                          <small>
                            المتبقي: {number(p.quantity / 1000)} {p.unit}
                          </small>
                        </div>
                        <span
                          className={
                            "badge " + (p.quantity ? "warning" : "danger-badge")
                          }
                        >
                          {p.quantity ? "منخفض" : "نفد"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <Empty text="مخزونك بخير">
                      <p>لا توجد منتجات تحت حد التنبيه.</p>
                    </Empty>
                  )}
                  {!isEmployee && (
                    <button
                      className="secondary full-width"
                      onClick={() => nav("purchases")}
                    >
                      <Plus size={17} />
                      جهّز طلب بضاعة
                    </button>
                  )}
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>آخر الحركات</h2>
                    <p className="muted">كل حركة بضاعة، مسجلة وواضحة</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => nav("movements")}
                  >
                    كل الحركات <ChevronLeft size={15} />
                  </button>
                </div>
                <MovementTable data={data} limit={5} />
              </section>
              <div className="insight-banner">
                <span className="soft-icon">
                  <Sparkles />
                </span>
                <div>
                  <b>مخزونك عنده أجوبة.</b>
                  <p>اسأل «شو لازم أطلب؟» وخلي الأرقام تساعدك.</p>
                </div>
                <button onClick={() => setModal("assistant")}>
                  اسأل مساعد مخزني <ChevronLeft size={17} />
                </button>
              </div>
            </>
          )}
          {view === "inventory" && (
            <>
              <div className="section-title">
                <div>
                  <h1>المخزون</h1>
                  <p className="muted">
                    منتجاتك، صورها، وكمياتها — بنظرة واحدة.
                  </p>
                </div>
                {!isEmployee && (
                  <button
                    className="primary"
                    onClick={() => {
                      setSelected(undefined);
                      setBarcode("");
                      setModal("product");
                    }}
                  >
                    <Plus size={19} />
                    إضافة منتج
                  </button>
                )}
              </div>
              <div className="panel">
                <div className="inventory-toolbar">
                  <div className="search-field">
                    <Search size={19} />
                    <input
                      placeholder="ابحث بالاسم، الباركود، التصنيف…"
                      value={q}
                      onChange={(e) => {
                        setPage(1);
                        setQ(e.target.value);
                      }}
                    />
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setModal("scanner")}
                  >
                    <ScanLine size={19} />
                    مسح
                  </button>
                  {!isEmployee && (
                    <button
                      className="icon-button"
                      title="تصدير المخزون"
                      aria-label="تصدير المخزون CSV"
                      onClick={exportCSV}
                    >
                      <Download size={20} />
                    </button>
                  )}
                </div>
                {data.products.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>المنتج</th>
                          <th>التصنيف</th>
                          <th>الكمية الحالية</th>
                          <th>الحالة</th>
                          <th>سعر البيع</th>
                          <th>إجراء سريع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <button
                                className="product-cell"
                                onClick={() => {
                                  setSelected(p);
                                  setModal("detail");
                                }}
                              >
                                <ProductIcon p={p} />
                                <span>
                                  <b>{p.name}</b>
                                  <small>{p.barcode}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="category-tag">{p.category}</span>
                            </td>
                            <td>
                              <b>{number(p.quantity / 1000)}</b>{" "}
                              <small>{p.unit}</small>
                            </td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (p.quantity === 0
                                    ? "danger-badge"
                                    : p.quantity <= p.minimum
                                      ? "warning"
                                      : "success")
                                }
                              >
                                {p.quantity === 0
                                  ? "نفد"
                                  : p.quantity <= p.minimum
                                    ? "منخفض"
                                    : "متوفر"}
                              </span>
                            </td>
                            <td>{number(p.selling_price / 100)} ₺</td>
                            <td>
                              <div className="button-row">
                                <button
                                  className="table-action"
                                  title="إدخال"
                                  aria-label={"إدخال " + p.name}
                                  onClick={() => action("in", p)}
                                >
                                  <ArrowDownToLine size={18} />
                                </button>
                                <button
                                  className="table-action"
                                  title="إخراج"
                                  aria-label={"إخراج " + p.name}
                                  onClick={() => action("out", p)}
                                >
                                  <ArrowUpFromLine size={18} />
                                </button>
                                <button
                                  className="table-action"
                                  title="جرد"
                                  aria-label={"جرد " + p.name}
                                  onClick={() => action("count", p)}
                                >
                                  <ClipboardCheck size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    text={q ? "لم نجد هذا المنتج" : "أضف أول منتج إلى مخزنك"}
                  >
                    {!isEmployee && (
                      <button
                        className="primary"
                        onClick={() => setModal("product")}
                      >
                        إضافة منتج
                      </button>
                    )}
                  </Empty>
                )}
                <div className="pagination">
                  <span>
                    الصفحة {number(page)} ·{" "}
                    {loading
                      ? "جارٍ التحديث…"
                      : `${number(data.products.length)} منتج`}
                  </span>
                  <div className="button-row">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      السابق
                    </button>
                    <button
                      disabled={!data.hasMore}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      التالي
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {view === "movements" && (
            <>
              <div className="section-title">
                <div>
                  <h1>حركة البضاعة</h1>
                  <p className="muted">آخر 50 حركة، مع السبب والمخزن.</p>
                </div>
                <button className="primary" onClick={() => setModal("in")}>
                  إدخال بضاعة
                </button>
              </div>
              <div className="button-row operation-toolbar">
                {[
                  "out",
                  "count",
                  "transfer",
                  "damaged",
                  "supplier_return",
                  "customer_return",
                  "lost",
                ].map((k) => (
                  <button
                    className="secondary"
                    key={k}
                    onClick={() => setModal(k)}
                  >
                    {kindLabels[k]}
                  </button>
                ))}
              </div>
              <section className="panel">
                <MovementTable data={data} />
              </section>
            </>
          )}
          {view === "low" && (
            <>
              <div className="section-title">
                <div>
                  <h1>شو ناقص؟</h1>
                  <p className="muted">الأهم أولًا، بدون إزعاج.</p>
                </div>
                <button className="secondary" onClick={() => load()}>
                  <RefreshCw size={17} />
                  تحديث
                </button>
              </div>
              <div className="management-grid">
                {data.low.map((p) => (
                  <div className="panel management-card" key={p.id}>
                    <div className="card-head">
                      <ProductIcon p={p} />
                      <h3>{p.name}</h3>
                    </div>
                    <p>
                      باقي{" "}
                      <b>
                        {number(p.quantity / 1000)} {p.unit}
                      </b>
                    </p>
                    <p className="muted">
                      نبهني عندما يبقى {number(p.minimum / 1000)}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => action("in", p)}
                    >
                      إضافة كمية
                    </button>
                  </div>
                ))}
              </div>
              <section className="panel">
                <h2>تنبيهات الصلاحية</h2>
                {data.expiry.length ? (
                  data.expiry.map((b) => (
                    <div className="low-row" key={b.id}>
                      <TriangleAlert size={20} />
                      <div>
                        <b>
                          {b.name} — {b.lot}
                        </b>
                        <small>
                          {b.warehouse} · {number(b.quantity / 1000)} {b.unit}
                        </small>
                      </div>
                      <span
                        className={
                          "badge " +
                          (b.expires! < new Date().toISOString().slice(0, 10)
                            ? "danger-badge"
                            : "warning")
                        }
                      >
                        {b.expires}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty text="لا توجد صلاحية قريبة" />
                )}
              </section>
            </>
          )}
          {view === "reports" && (
            <>
              <div className="section-title">
                <div>
                  <h1>تقارير مفهومة</h1>
                  <p className="muted">آخر 30 يوم · كميات ووضع المخزون</p>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={exportCSV}>
                    <Download size={18} />
                    تصدير CSV
                  </button>
                  <button className="primary" onClick={() => window.print()}>
                    طباعة / PDF
                  </button>
                </div>
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>دخل خلال 30 يوم</span>
                  <strong>
                    {number(
                      data.daily.reduce((n, d) => n + d.incoming, 0) / 1000,
                    )}
                  </strong>
                </div>
                <div className="stat-card">
                  <span>خرج خلال 30 يوم</span>
                  <strong>
                    {number(
                      data.daily.reduce((n, d) => n + d.outgoing, 0) / 1000,
                    )}
                  </strong>
                </div>
                <div className="stat-card">
                  <span>قيمة المخزون التقريبية</span>
                  <strong>{number(data.stats.value || 0)} ₺</strong>
                </div>
                <div className="stat-card">
                  <span>منتجات تحتاج طلب</span>
                  <strong>{number(data.stats.low + data.stats.empty)}</strong>
                </div>
              </div>
              <section className="panel">
                <h2>اقتراحات الطلب</h2>
                <p className="muted">
                  تقدير مبني على معدل الإخراج في آخر 30 يوم، لتغطية 14 يومًا.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>المنتج</th>
                        <th>الاستهلاك / يوم</th>
                        <th>متوقع أن ينفد خلال</th>
                        <th>الكمية المقترحة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{number(p.reorder.daily)}</td>
                          <td>
                            {p.reorder.days === null
                              ? "بيانات غير كافية"
                              : `${number(p.reorder.days)} يوم`}
                          </td>
                          <td>
                            {number(p.reorder.suggested)} {p.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <h2>حركة المخزون</h2>
                <MovementTable data={data} />
              </section>
            </>
          )}
          {[
            "suppliers",
            "purchases",
            "warehouses",
            "members",
            "audit",
          ].includes(view) && (
            <Management view={view} data={data} changed={() => void load()} />
          )}
          {view === "settings" && (
            <SettingsPanel data={data} notify={setToast} />
          )}
        </main>
        <footer className="app-footer">
          <span>مخزني · كل شيء في مكانه</span>
          <span>
            <ShieldCheck size={14} />
            كل حركة محفوظة
          </span>
        </footer>
      </div>
      <nav className="bottom-nav">
        <button
          onClick={() => nav("dashboard")}
          className={view === "dashboard" ? "active" : ""}
        >
          <LayoutDashboard />
          الرئيسية
        </button>
        <button
          onClick={() => nav("inventory")}
          className={view === "inventory" ? "active" : ""}
        >
          <Boxes />
          المخزون
        </button>
        <button
          className="bottom-add"
          aria-label="إدخال بضاعة"
          onClick={() => setModal("in")}
        >
          <Plus />
        </button>
        <button onClick={() => setModal("count")}>
          <ClipboardCheck />
          جرد
        </button>
        <button onClick={() => setModal("assistant")}>
          <Sparkles />
          المساعد
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {toast}
        </div>
      )}
      {modal === "product" && (
        <Modal
          title={selected ? "تعديل المنتج" : "إضافة منتج"}
          close={() => setModal(null)}
        >
          <ProductForm product={selected} barcode={barcode} saved={saved} />
        </Modal>
      )}
      {modal && Object.keys(kindLabels).includes(modal) && (
        <Modal title={kindLabels[modal]} close={() => setModal(null)}>
          <StockForm
            kind={modal}
            data={data}
            initial={draft}
            saved={saved}
            unknown={(code) => {
              setBarcode(code);
              setSelected(undefined);
              setModal("product");
            }}
          />
        </Modal>
      )}
      {modal === "detail" && selected && (
        <Modal title="تفاصيل المنتج" close={() => setModal(null)}>
          <ProductDetails
            product={selected}
            canEdit={!isEmployee}
            edit={() => setModal("product")}
            saved={saved}
          />
        </Modal>
      )}
      {modal === "scanner" && (
        <Modal title="مسح الباركود" close={() => setModal(null)}>
          <Scanner
            onScan={async (code) => {
              try {
                const d = await get("dashboard&q=" + encodeURIComponent(code));
                const p = d.products.find(
                  (p: Product) => p.barcode === code || p.id === code,
                );
                if (p) {
                  setSelected(p);
                  setModal("detail");
                } else {
                  setBarcode(code);
                  setSelected(undefined);
                  setModal("product");
                }
              } catch (e) {
                setToast((e as Error).message);
              }
            }}
          />
        </Modal>
      )}
      {modal === "assistant" && (
        <Modal title="مساعد مخزني" close={() => setModal(null)}>
          <p className="muted">إجابات من بياناتك · أي تعديل يحتاج تأكيدك</p>
          <div className="suggestions">
            {["شو ناقص؟", "شو صار اليوم؟", "شو قربت صلاحيته؟"].map((s) => (
              <button key={s} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div className={"chat-message " + (m.mine ? "mine" : "")} key={i}>
                {!m.mine && <Sparkles size={16} />}
                <p>{m.text}</p>
                {m.draft && (
                  <button
                    className="primary"
                    onClick={() => {
                      setDraft(m.draft);
                      setModal(m.draft!.kind);
                    }}
                  >
                    مراجعة العملية
                  </button>
                )}
              </div>
            ))}
            {thinking && <div className="muted">جارٍ البحث في مخزونك…</div>}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <button
              type="button"
              className="icon-button"
              aria-label="إملاء صوتي"
              onClick={voice}
            >
              <Mic size={20} />
            </button>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="اسأل عن مخزونك…"
            />
            <button disabled={thinking} className="primary" aria-label="إرسال">
              <Send size={18} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function MovementTable({
  data,
  limit = 50,
}: {
  data: Snapshot;
  limit?: number;
}) {
  return data.movements.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>المنتج</th>
            <th>الحركة</th>
            <th>الكمية</th>
            <th>المخزن</th>
            <th>الوقت</th>
          </tr>
        </thead>
        <tbody>
          {data.movements.slice(0, limit).map((m) => (
            <tr key={m.id}>
              <td>
                <b>{m.name}</b>
                {m.reason && <small className="cell-note">{m.reason}</small>}
              </td>
              <td>
                <span
                  className={
                    "badge " + (m.delta >= 0 ? "success" : "blue-badge")
                  }
                >
                  {kindLabels[m.kind]}
                </span>
              </td>
              <td className={m.delta >= 0 ? "positive" : "negative"} dir="ltr">
                {m.delta > 0 ? "+" : ""}
                {number(m.delta / 1000)} {m.unit}
              </td>
              <td>{m.warehouse}</td>
              <td>
                <small>{m.created_at}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="لا توجد حركات بعد" />
  );
}
function SettingsPanel({
  data,
  notify,
}: {
  data: Snapshot;
  notify: (s: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  function review() {
    setDrafts(
      JSON.parse(localStorage.getItem("mk-drafts") || "[]").filter(
        (d: Record<string, unknown>) => d.email === data.email,
      ),
    );
  }
  return (
    <>
      <div className="section-title">
        <h1>الإعدادات</h1>
      </div>
      <div className="management-grid">
        <section className="panel">
          <h2>المسودات دون اتصال</h2>
          <p className="muted">
            راجع كل مسودة عند عودة الاتصال. الجرد يتطلب بقاء الكمية المسجلة كما
            كانت.
          </p>
          <button className="secondary" onClick={review}>
            مراجعة المسودات
          </button>
          {drafts.map((d, i) => (
            <div className="low-row" key={String(d.id)}>
              <span>
                {kindLabels[String(d.kind)]} · {String(d.quantity)}
              </span>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await api(d);
                    const all = JSON.parse(
                      localStorage.getItem("mk-drafts") || "[]",
                    );
                    localStorage.setItem(
                      "mk-drafts",
                      JSON.stringify(
                        all.filter(
                          (x: Record<string, unknown>) => x.id !== d.id,
                        ),
                      ),
                    );
                    setDrafts((ds) => ds.filter((_, j) => i !== j));
                    notify("تمت مزامنة المسودة");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                تأكيد ومزامنة
              </button>
            </div>
          ))}
          <ErrorBox error={error} />
        </section>
        <section className="panel">
          <h2>قراءة الفواتير</h2>
          <p className="muted">
            ربط مزوّد قراءة الفواتير غير مفعّل. يمكن تسجيل البضاعة من شاشة طلبات
            البضاعة ومراجعة الكميات قبل الاستلام.
          </p>
          <span className="badge neutral">
            <FileText size={15} />
            يحتاج إعداد مزوّد OCR
          </span>
        </section>
        <section className="panel">
          <h2>WhatsApp Business</h2>
          <p className="muted">
            واجهة الربط الرسمية جاهزة في الكود. إرسال الرسائل يحتاج حساب Meta
            Business وقوالب معتمدة ومفاتيح وصول.
          </p>
          <span className="badge neutral">غير متصل</span>
        </section>
      </div>
    </>
  );
}
