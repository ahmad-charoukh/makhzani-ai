"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { api, units, type Product } from "./types";
import { Field, ErrorBox } from "./primitives";
export default function ProductForm({
  product,
  barcode,
  saved,
}: {
  product?: Product;
  barcode?: string;
  saved: () => void;
}) {
  const [generated] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api({
        type: "product",
        id: product?.id,
        name: f.get("name"),
        barcode: f.get("barcode"),
        sku: f.get("sku"),
        category: f.get("category"),
        unit: f.get("unit"),
        minimum: Number(f.get("minimum")),
        purchasePrice: Number(f.get("purchasePrice")),
        sellingPrice: Number(f.get("sellingPrice")),
        brand: f.get("brand"),
        subcategory: f.get("subcategory"),
        supplierId: product?.supplier_id || null,
        shelf: f.get("shelf"),
        description: f.get("description"),
        notes: f.get("notes"),
        tax: Number(f.get("tax")),
        expiryEnabled: f.get("expiry") === "on",
      });
      for (const file of files) {
        const body = new FormData();
        body.set("file", await optimize(file));
        body.set("productId", r.id);
        const upload = await fetch("/api/images", { method: "POST", body });
        if (!upload.ok)
          throw Error(
            "حُفظ المنتج لكن تعذر رفع إحدى الصور، افتح المنتج وأعد رفعها.",
          );
      }
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <div className="form-grid">
        <Field label="اسم المنتج *">
          <input
            name="name"
            required
            defaultValue={product?.name}
            placeholder="مثال: مياه معدنية 500 مل"
          />
        </Field>
        <Field label="التصنيف">
          <input
            name="category"
            defaultValue={product?.category || "مواد غذائية"}
          />
        </Field>
        <Field label="الباركود *">
          <input
            name="barcode"
            required
            defaultValue={product?.barcode || barcode || `MK${generated}`}
            dir="ltr"
          />
        </Field>
        <Field label="رمز المنتج *">
          <input
            name="sku"
            required
            defaultValue={
              product?.sku || `SKU${generated.toString().slice(-7)}`
            }
            dir="ltr"
          />
        </Field>
        <Field label="الوحدة">
          <input
            name="unit"
            list="units"
            defaultValue={product?.unit || "قطعة"}
            required
          />
          <datalist id="units">
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </datalist>
        </Field>
        <Field label="نبهني عندما يبقى">
          <input
            name="minimum"
            type="number"
            min="0"
            step="0.001"
            defaultValue={(product?.minimum ?? 5000) / 1000}
          />
        </Field>
        <Field label="سعر الشراء">
          <input
            name="purchasePrice"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(product?.purchase_price || 0) / 100}
          />
        </Field>
        <Field label="سعر البيع">
          <input
            name="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(product?.selling_price || 0) / 100}
          />
        </Field>
      </div>
      <details>
        <summary>تفاصيل إضافية</summary>
        <div className="form-grid">
          <Field label="التصنيف الفرعي">
            <input name="subcategory" defaultValue={product?.subcategory} />
          </Field>
          <Field label="العلامة التجارية">
            <input name="brand" defaultValue={product?.brand} />
          </Field>
          <Field label="مكان الرف">
            <input name="shelf" defaultValue={product?.shelf} />
          </Field>
          <Field label="الضريبة %">
            <input
              name="tax"
              type="number"
              min="0"
              max="100"
              defaultValue={product?.tax || 0}
            />
          </Field>
          <Field label="وصف المنتج">
            <input name="description" defaultValue={product?.description} />
          </Field>
          <Field label="ملاحظات">
            <input name="notes" defaultValue={product?.notes} />
          </Field>
        </div>
      </details>
      <label className="check">
        <input
          name="expiry"
          type="checkbox"
          defaultChecked={!!product?.expiry_enabled}
        />
        هذا المنتج له تاريخ صلاحية
      </label>
      <Field label="صور المنتج — حتى 8 صور">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            const f = Array.from(e.target.files || []).slice(0, 8);
            setFiles(f);
            previews.forEach(URL.revokeObjectURL);
            setPreviews(f.map(URL.createObjectURL));
          }}
        />
      </Field>
      <div className="preview-images">
        {previews.map((s) => (
          <img key={s} src={s} alt="معاينة صورة المنتج" />
        ))}
      </div>
      <ErrorBox error={error} />
      <button disabled={busy} className="primary">
        {busy ? "جارٍ الحفظ…" : "حفظ المنتج"}
      </button>
    </form>
  );
}
async function optimize(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  if (!blob) throw Error("تعذر معالجة الصورة");
  return new File([blob], "product.webp", { type: "image/webp" });
}
