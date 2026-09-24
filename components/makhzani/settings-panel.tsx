"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, RefreshCw, WifiOff } from "lucide-react";
import { api, kindLabels, number, type Snapshot } from "./types";
import { Empty, ErrorBox } from "./primitives";

type StoredDraft = Record<string, unknown> & {
  id: string;
  email: string;
  productId: string;
  warehouseId: string;
  kind: string;
  quantity: number;
};

const storageKey = "mk-drafts";
const account = (email: string) => email.trim().toLowerCase();

function readStoredDrafts(): unknown[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    throw Error(
      "تعذر الوصول إلى المسودات على هذا الجهاز. تحقق من إعدادات تخزين المتصفح ثم حاول مجددًا.",
    );
  }
  if (!raw) return [];
  try {
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) throw Error();
    return stored;
  } catch {
    throw Error(
      "تعذر قراءة المسودات المحفوظة. لم نغيّرها أو نحذفها؛ حاول من المتصفح الذي حفظتها فيه.",
    );
  }
}

function belongsTo(
  value: unknown,
  email: string,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string" &&
    account(value.email) === account(email)
  );
}

function currentDrafts(stored: unknown[], email: string): StoredDraft[] {
  const owned = stored.filter((value) => belongsTo(value, email));
  if (
    owned.some(
      (draft) =>
        draft.type !== "stock" ||
        typeof draft.id !== "string" ||
        !draft.id ||
        typeof draft.productId !== "string" ||
        typeof draft.warehouseId !== "string" ||
        typeof draft.kind !== "string" ||
        !Object.hasOwn(kindLabels, draft.kind) ||
        typeof draft.quantity !== "number" ||
        !Number.isFinite(draft.quantity) ||
        draft.quantity < 0,
    )
  ) {
    throw Error(
      "توجد مسودة غير مكتملة في حسابك. احتفظنا بجميع المسودات دون تغيير؛ تعذرت المزامنة حتى تُراجع بياناتها.",
    );
  }
  return owned as StoredDraft[];
}

export default function SettingsPanel({
  data,
  notify,
  changed,
}: {
  data: Snapshot;
  notify: (message: string) => void;
  changed: () => void;
}) {
  const [drafts, setDrafts] = useState<StoredDraft[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const visibleDrafts = drafts.filter((draft) => belongsTo(draft, data.email));

  function review() {
    setError("");
    try {
      setDrafts(currentDrafts(readStoredDrafts(), data.email));
      setReviewed(true);
    } catch (e) {
      setDrafts([]);
      setReviewed(false);
      setError((e as Error).message);
    }
  }

  async function sync(draft: StoredDraft) {
    if (pendingRef.current) return;
    setError("");
    if (!navigator.onLine) {
      setError(
        "أنت دون اتصال. المسودة ما زالت محفوظة على هذا الجهاز؛ أعد المحاولة عند عودة الاتصال.",
      );
      return;
    }
    pendingRef.current = draft.id;
    setPending(draft.id);
    let saved = false;
    try {
      const latest = currentDrafts(readStoredDrafts(), data.email);
      const current = latest.find((item) => item.id === draft.id);
      if (!current) {
        setDrafts(latest);
        throw Error(
          "هذه المسودة لم تعد موجودة على الجهاز. حدّث القائمة لمراجعة المسودات المتبقية.",
        );
      }
      await api({ ...current, type: "stock" });
      saved = true;
      changed();
      const remaining = readStoredDrafts().filter(
        (item) => !(belongsTo(item, data.email) && item.id === current.id),
      );
      localStorage.setItem(storageKey, JSON.stringify(remaining));
      setDrafts(currentDrafts(remaining, data.email));
      notify("تمت مزامنة المسودة وتحديث المخزون");
    } catch (e) {
      setError(
        saved
          ? "تم حفظ العملية في المخزون، لكن تعذر تحديث قائمة المسودات على الجهاز. إعادة المحاولة بنفس المسودة لن تكرر العملية."
          : (e as Error).message,
      );
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
  }

  return (
    <>
      <div className="section-title">
        <div>
          <h1>التفضيلات والمسودات</h1>
          <p className="muted">
            راجع عملياتك المحفوظة على هذا الجهاز قبل إضافتها إلى المخزون.
          </p>
        </div>
      </div>
      <div className="management-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <WifiOff size={20} /> المسودات دون اتصال
            </h2>
          </div>
          <p className="muted">
            تظهر هنا مسودات حسابك الحالي فقط. المزامنة تحتاج إلى اتصال، والجرد
            يتطلب بقاء الكمية المسجلة كما كانت.
          </p>
          <button className="secondary" disabled={!!pending} onClick={review}>
            <RefreshCw size={17} />
            {reviewed ? "تحديث المسودات" : "مراجعة المسودات"}
          </button>
          <ErrorBox error={error} />
          {reviewed && (
            <p className="muted" role="status">
              {number(visibleDrafts.length)} مسودة بانتظار المراجعة
            </p>
          )}
          {reviewed && visibleDrafts.length === 0 && (
            <Empty text="لا توجد مسودات لحسابك على هذا الجهاز" />
          )}
          {visibleDrafts.map((draft) => {
            const product = data.products.find(
              (item) => item.id === draft.productId,
            );
            const warehouse = data.warehouses.find(
              (item) => item.id === draft.warehouseId,
            );
            const productName =
              product?.name ||
              (typeof draft.productName === "string"
                ? draft.productName
                : "المنتج: " + draft.productId);
            const warehouseName =
              warehouse?.name ||
              (typeof draft.warehouseName === "string"
                ? draft.warehouseName
                : "المخزن: " + draft.warehouseId);
            const unit =
              product?.unit ||
              (typeof draft.unit === "string" ? draft.unit : "");
            return (
              <div className="low-row draft-row" key={draft.id}>
                <div>
                  <strong>
                    {kindLabels[draft.kind]} · {number(draft.quantity)} {unit}
                  </strong>
                  <p className="muted">{productName}</p>
                  <small>{warehouseName}</small>
                  {typeof draft.reason === "string" && draft.reason && (
                    <p className="muted">السبب: {draft.reason}</p>
                  )}
                </div>
                <button
                  className="primary"
                  disabled={!!pending}
                  onClick={() => void sync(draft)}
                >
                  <CheckCircle2 size={17} />
                  {pending === draft.id ? "جارٍ المزامنة…" : "تأكيد ومزامنة"}
                </button>
              </div>
            );
          })}
        </section>
        <section className="panel">
          <h2>قراءة الفواتير</h2>
          <p className="muted">
            قراءة الفواتير تلقائيًا غير مفعّلة حاليًا. سجّل البضاعة من طلبات
            البضاعة وراجع الكميات قبل الاستلام.
          </p>
          <span className="badge neutral">
            <FileText size={15} /> غير مفعّل
          </span>
        </section>
        <section className="panel">
          <h2>WhatsApp Business</h2>
          <p className="muted">
            تنبيهات WhatsApp غير مفعّلة حاليًا. يمكنك متابعة النواقص ومواعيد
            الصلاحية داخل مخزني.
          </p>
          <span className="badge neutral">غير متصل</span>
        </section>
      </div>
    </>
  );
}
