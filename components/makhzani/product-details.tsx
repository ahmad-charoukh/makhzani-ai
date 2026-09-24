"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Printer, Pencil, Archive, LoaderCircle } from "lucide-react";
import { api, get, number, type Product, type Batch } from "./types";
import { ErrorBox, ProductIcon } from "./primitives";
export default function ProductDetails({
  product: p,
  canEdit,
  edit,
  saved,
}: {
  product: Product;
  canEdit: boolean;
  edit: () => void;
  saved: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [images, setImages] = useState<{ id: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  useEffect(() => {
    let active = true;
    try {
      if (svg.current)
        JsBarcode(svg.current, p.barcode, {
          format: "CODE128",
          height: 42,
          width: 1.5,
          fontSize: 14,
          margin: 12,
        });
      if (canvas.current)
        void QRCode.toCanvas(canvas.current, p.barcode, {
          width: 110,
          margin: 1,
        }).catch(() => {
          if (active) setError("تعذر إنشاء رمز QR لهذا المنتج");
        });
    } catch {
      queueMicrotask(() => {
        if (active) setError("تعذر إنشاء باركود لهذا الرمز");
      });
    }
    void get("detail&id=" + encodeURIComponent(p.id))
      .then((d) => {
        if (!active) return;
        setBatches(d.batches);
        setImages(d.images);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [p.id, p.barcode, detailVersion]);
  return (
    <div className="form-stack">
      <div className="selected-product">
        <ProductIcon p={p} />
        <div>
          <h2>{p.name}</h2>
          <p className="muted">
            {p.category} · <bdi>{p.sku}</bdi>
          </p>
        </div>
        <strong>
          {number(p.quantity / 1000)} {p.unit}
        </strong>
      </div>
      <dl className="product-facts">
        <div>
          <dt>حالة المخزون</dt>
          <dd>
            <span
              className={`badge ${p.quantity <= 0 ? "empty-stock" : p.quantity <= p.minimum ? "low-stock" : "in-stock"}`}
            >
              {p.quantity <= 0
                ? "نافد"
                : p.quantity <= p.minimum
                  ? "مخزون منخفض"
                  : "متوفر"}
            </span>
          </dd>
        </div>
        <div>
          <dt>الحد الأدنى</dt>
          <dd>
            {number(p.minimum / 1000)} {p.unit}
          </dd>
        </div>
        {p.purchase_price !== undefined && (
          <div>
            <dt>سعر الشراء</dt>
            <dd>{number(p.purchase_price / 100)} ₺</dd>
          </div>
        )}
        <div>
          <dt>سعر البيع</dt>
          <dd>{number(p.selling_price / 100)} ₺</dd>
        </div>
        <div>
          <dt>الباركود</dt>
          <dd>
            <bdi>{p.barcode}</bdi>
          </dd>
        </div>
        {p.shelf && (
          <div>
            <dt>مكان الرف</dt>
            <dd>{p.shelf}</dd>
          </div>
        )}
      </dl>
      {p.description && <p className="muted">{p.description}</p>}
      {images.length > 0 && (
        <div className="preview-images">
          {images.map((i) => (
            <ProductIcon key={i.id} p={{ name: p.name, image_id: i.id }} />
          ))}
        </div>
      )}
      <div className="label-print">
        <h3>{p.name}</h3>
        <svg ref={svg} role="img" aria-label={`باركود ${p.barcode}`} />
        <canvas
          ref={canvas}
          role="img"
          aria-label={`رمز QR للمنتج ${p.name}`}
        />
      </div>
      <div className="button-row">
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={18} />
          طباعة الملصق
        </button>
        {canEdit && (
          <button className="primary" onClick={edit}>
            <Pencil size={17} />
            تعديل
          </button>
        )}
      </div>
      <h3>الدفعات والمخازن</h3>
      {loading ? (
        <p className="muted" role="status">
          جارٍ تحميل الدفعات والمخازن…
        </p>
      ) : error && !batches.length ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setError("");
            setLoading(true);
            setDetailVersion((version) => version + 1);
          }}
        >
          إعادة تحميل التفاصيل
        </button>
      ) : batches.length ? (
        batches.map((b) => (
          <div className="low-row" key={b.id}>
            <div>
              <b>{b.lot}</b>
              <small>
                {b.warehouse} · {b.expires || "بدون صلاحية"}
              </small>
            </div>
            <strong>
              {number(b.quantity / 1000)} {p.unit}
            </strong>
          </div>
        ))
      ) : (
        <p className="muted">لم تُضف كميات بعد.</p>
      )}
      <ErrorBox error={error} />
      {canEdit && p.quantity === 0 && !confirmArchive && (
        <button
          className="text-button danger"
          type="button"
          onClick={() => setConfirmArchive(true)}
        >
          <Archive size={17} />
          أرشفة المنتج
        </button>
      )}
      {confirmArchive && (
        <div className="info-box form-stack">
          <p>سيُخفى المنتج من قائمة المخزون. سيبقى سجل حركاته محفوظًا.</p>
          <div className="button-row">
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await api({ type: "archive", id: p.id });
                  saved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && (
                <LoaderCircle size={17} className="spin" aria-hidden="true" />
              )}
              {busy ? "جارٍ الأرشفة…" : "تأكيد الأرشفة"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setConfirmArchive(false)}
            >
              تراجع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
