"use client";
import { useRef, useState } from "react";
import { api, get, kindLabels, number, type Snapshot } from "./types";
import { Empty, ErrorBox, Modal } from "./primitives";
type Draft = Record<string, unknown> & {
  id: string;
  email: string;
  businessId?: string;
  productId: string;
  warehouseId: string;
  kind: string;
  quantity: number;
};
function stored(): Draft[] {
  const value = JSON.parse(localStorage.getItem("mk-drafts") || "[]");
  if (!Array.isArray(value)) throw Error("تعذر قراءة المسودات المحفوظة");
  if (
    value.some(
      (d) =>
        !d ||
        typeof d !== "object" ||
        typeof d.id !== "string" ||
        typeof d.email !== "string" ||
        d.type !== "stock" ||
        typeof d.productId !== "string" ||
        typeof d.warehouseId !== "string" ||
        !Object.hasOwn(kindLabels, d.kind) ||
        typeof d.quantity !== "number" ||
        !Number.isFinite(d.quantity) ||
        d.quantity < 0,
    )
  )
    throw Error("توجد مسودة غير مكتملة؛ لم نغير البيانات المحفوظة");
  return value;
}
export default function DraftsPanel({
  data,
  changed,
}: {
  data: Snapshot;
  changed: () => void;
}) {
  const pending = useRef(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{
    draft: Draft;
    name: string;
    unit: string;
    current: number;
  } | null>(null);
  function refresh() {
    try {
      setDrafts(
        stored().filter(
          (d) =>
            d.email.trim().toLowerCase() === data.email.trim().toLowerCase() &&
            (d.businessId
              ? d.businessId === data.business.id
              : data.warehouses.some((w) => w.id === d.warehouseId)),
        ),
      );
      setError("");
    } catch {
      setError("تعذر قراءة المسودات المحفوظة على هذا الجهاز");
    }
  }
  function remove(d: Draft) {
    localStorage.setItem(
      "mk-drafts",
      JSON.stringify(
        stored().filter(
          (x) =>
            x.id !== d.id ||
            x.email !== d.email ||
            x.businessId !== d.businessId,
        ),
      ),
    );
    refresh();
  }
  async function open(draft: Draft) {
    setBusy(true);
    setError("");
    try {
      const r = await get("detail&id=" + encodeURIComponent(draft.productId));
      const warehouse = data.warehouses.find((w) => w.id === draft.warehouseId);
      if (!warehouse) throw Error("المخزن غير متاح في حسابك الحالي");
      const product = r.product;
      if (!product) throw Error("تعذر تحميل المنتج");
      setReview({
        draft,
        name: product.name,
        unit: product.unit,
        current:
          r.batches
            .filter((b) => b.warehouse_id === draft.warehouseId)
            .reduce((n, b) => n + b.quantity, 0) / 1000,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api(review.draft);
      changed();
      remove(review.draft);
      setReview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <h1>المسودات</h1>
          <p className="muted">
            محفوظة على هذا الجهاز. راجع التفاصيل قبل إضافتها للمخزون.
          </p>
        </div>
        <button className="secondary" onClick={refresh}>
          عرض المسودات
        </button>
      </div>
      <ErrorBox error={error} />
      <section className="panel">
        {drafts?.length === 0 && <Empty text="لا توجد مسودات لهذا الحساب" />}
        {drafts?.map((d) => (
          <div className="low-row" key={d.id}>
            <div>
              <strong>{String(d.productName || "بضاعة محفوظة")}</strong>
              <p>
                {kindLabels[d.kind]} · {number(d.quantity)}{" "}
                {String(d.unit || "")}
              </p>
              <small>{String(d.createdAt || "")}</small>
            </div>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void open(d)}
              >
                مراجعة
              </button>
              <button
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("حذف هذه المسودة من الجهاز؟")) {
                    try {
                      remove(d);
                    } catch {
                      setError("تعذر حذف المسودة");
                    }
                  }
                }}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </section>
      {review && (
        <Modal
          title="مراجعة المسودة"
          close={() => {
            if (!busy) setReview(null);
          }}
        >
          <div className="form-stack">
            <h2>{review.name}</h2>
            <p>
              {kindLabels[review.draft.kind]}: {number(review.draft.quantity)}{" "}
              {review.unit}
            </p>
            <p>
              المخزن:{" "}
              {
                data.warehouses.find((w) => w.id === review.draft.warehouseId)
                  ?.name
              }
            </p>
            {!!review.draft.toWarehouseId && (
              <p>
                إلى:{" "}
                {
                  data.warehouses.find(
                    (w) => w.id === review.draft.toWarehouseId,
                  )?.name
                }
              </p>
            )}
            <p>
              الموجود الآن: {number(review.current)} {review.unit}
            </p>
            {review.draft.kind === "count" && (
              <p>
                المسجل وقت الجرد: {number(Number(review.draft.expected))} ·
                الفرق وقت الجرد:{" "}
                {number(review.draft.quantity - Number(review.draft.expected))}
              </p>
            )}
            {["reason", "lot", "expires", "invoice"].map((k, i) =>
              review.draft[k] ? (
                <p key={k}>
                  {["السبب", "الدفعة", "الصلاحية", "الفاتورة"][i]}:{" "}
                  {String(review.draft[k])}
                </p>
              ) : null,
            )}
            <ErrorBox error={error} />
            <button
              className="primary"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "جارٍ الحفظ…" : "تأكيد وإضافة للمخزون"}
            </button>
            <p className="muted">
              يعاد التحقق من الصلاحيات والكميات عند التأكيد.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
