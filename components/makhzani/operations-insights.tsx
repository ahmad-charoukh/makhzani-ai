"use client";
import { Bell, CheckCircle2, Clock3, Package, ShoppingBag, TrendingUp, TriangleAlert } from "lucide-react";
import { Empty, Modal } from "./primitives";
import { number, purchaseLabels, type Snapshot } from "./types";

export function NotificationCenter({data, close, navigate}: {data: Snapshot; close:()=>void; navigate:(view:string)=>void}) {
  const [expired, soon] = [data.insights?.expiry.expired || 0, data.insights?.expiry.soon || 0];
  const pending = data.insights?.pendingPurchases || [];
  const count = data.stats.low + data.stats.empty + expired + soon + (pending[0]?.total || 0);
  return <Modal title="مركز التنبيهات" close={close}>
    <p className="muted">ابدأ بما يؤثر على مخزونك اليوم. تُحدّث التنبيهات بعد كل عملية.</p>
    <div className="notification-summary" aria-label="ملخص التنبيهات">
      <span><b>{number(data.stats.low + data.stats.empty)}</b> منتجات تحتاج طلب</span>
      <span><b>{number(expired+soon)}</b> دفعات تحتاج متابعة</span>
      {data.role !== "employee" && <span><b>{number(pending[0]?.total || 0)}</b> طلبات قيد الاستلام</span>}
    </div>
    {!count ? <Empty text="كل شيء تحت السيطرة"><CheckCircle2/><p>لا توجد تنبيهات مخزون حالية.</p></Empty> : <div className="notification-list">
      {data.stats.empty>0 && <button className="notification-row" onClick={()=>navigate("low")}><span className="insight-icon danger"><Package size={20}/></span><span><b>{number(data.stats.empty)} منتج نافد</b><small>راجع النواقص وجهّز إعادة الطلب</small></span></button>}
      {data.stats.low>0 && <button className="notification-row" onClick={()=>navigate("low")}><span className="insight-icon warning"><TriangleAlert size={20}/></span><span><b>{number(data.stats.low)} منتج منخفض المخزون</b><small>وصلت الكمية إلى الحد الأدنى أو أقل</small></span></button>}
      {expired>0 && <button className="notification-row" onClick={()=>navigate("low")}><span className="insight-icon danger"><Clock3 size={20}/></span><span><b>{number(expired)} دفعة منتهية الصلاحية</b><small>اعزل الدفعات وراجع إجراء التالف</small></span></button>}
      {soon>0 && <button className="notification-row" onClick={()=>navigate("low")}><span className="insight-icon warning"><Clock3 size={20}/></span><span><b>{number(soon)} دفعة تنتهي خلال 30 يومًا</b><small>أعطِ الأولوية للصرف حسب أقرب صلاحية</small></span></button>}
      {pending.map(p=><button className="notification-row" key={p.id} onClick={()=>navigate("purchases")}><span className="insight-icon"><ShoppingBag size={20}/></span><span><b>{p.supplier}</b><small>{purchaseLabels[p.status]} · بانتظار استلام البضاعة</small></span></button>)}
    </div>}
  </Modal>;
}

export function OperationsInsights({data, navigate, search}: {data: Snapshot; navigate:(view:string)=>void; search:(name:string)=>void}) {
  const top = data.insights?.topMoving || [];
  const pending = data.insights?.pendingPurchases || [];
  return <div className="operations-grid">
    <section className="panel">
      <div className="panel-heading"><div><h2><TrendingUp size={18}/> الأكثر حركة</h2><p className="muted">حسب عدد عمليات الإخراج خلال 30 يومًا</p></div></div>
      {top.length ? <ol className="ranked-products">{top.map((p,i)=><li key={p.id}><button onClick={()=>search(p.name)}><span className="rank-number">{number(i+1)}</span><span><b>{p.name}</b><small>{number(p.quantity/1000)} {p.unit} خرجت من المخزون</small></span><span className="badge neutral">{number(p.operations)} حركة</span></button></li>)}</ol> : <Empty text="تظهر المنتجات النشطة بعد أول إخراج"/>}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2><Bell size={18}/> متابعة المشتريات</h2><p className="muted">{number(pending[0]?.total || 0)} طلب قيد الاستلام</p></div><button className="text-button" onClick={()=>navigate("purchases")}>كل الطلبات</button></div>
      {pending.length ? <div className="pending-purchases">{pending.map(p=><button key={p.id} onClick={()=>navigate("purchases")}><span><b>{p.supplier}</b><small>{new Date(p.created_at.replace(" ","T")+(/Z|[+-]\d\d:\d\d$/.test(p.created_at)?"":"Z")).toLocaleDateString("ar")}</small></span><span className="badge amber">{purchaseLabels[p.status]}</span></button>)}</div> : <Empty text="لا توجد طلبات معلّقة"><p>ستظهر هنا الطلبات المرسلة والمؤكدة والمستلمة جزئيًا.</p><button className="secondary" onClick={()=>navigate("purchases")}>إدارة المشتريات</button></Empty>}
    </section>
  </div>;
}
