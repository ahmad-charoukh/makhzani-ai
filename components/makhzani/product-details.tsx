"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Printer, Pencil, Archive } from "lucide-react";
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
  useEffect(() => {
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
        });
    } catch {
      queueMicrotask(() => setError("تعذر إنشاء باركود لهذا الرمز"));
    }
    void get("detail&id=" + p.id)
      .then((d) => {
        setBatches(d.batches);
        setImages(d.images);
      })
      .catch((e) => setError(e.message));
  }, [p.id, p.barcode]);
  return (
    <div className="form-stack">
      <div className="selected-product">
        <ProductIcon p={p} />
        <div>
          <h2>{p.name}</h2>
          <p className="muted">
            {p.category} · {p.sku}
          </p>
        </div>
        <strong>
          {number(p.quantity / 1000)} {p.unit}
        </strong>
      </div>
      {images.length > 0 && (
        <div className="preview-images">
          {images.map((i) => (
            <img key={i.id} src={"/api/images/" + i.id} alt={p.name} />
          ))}
        </div>
      )}
      <div className="label-print">
        <h3>{p.name}</h3>
        <svg ref={svg} />
        <canvas ref={canvas} />
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
      {batches.length ? (
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
      {canEdit && p.quantity === 0 && (
        <button
          className="text-button danger"
          onClick={async () => {
            try {
              await api({ type: "archive", id: p.id });
              saved();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Archive size={17} />
          أرشفة المنتج
        </button>
      )}
    </div>
  );
}
