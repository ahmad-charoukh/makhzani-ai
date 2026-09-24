"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
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
  const savedId = useRef(product?.id);
  const uploadedCount = useRef(0);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api({
        type: "product",
        id: savedId.current,
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
      savedId.current = r.id;
      for (let i = uploadedCount.current; i < files.length; i++) {
        const body = new FormData();
        body.set("file", await optimize(files[i]));
        body.set("productId", r.id);
        const upload = await fetch("/api/images", { method: "POST", body });
        if (!upload.ok)
          throw Error(
            "حُفظ المنتج، لكن تعذر رفع إحدى الصور. اضغط حفظ مجددًا لإكمال رفع الصور.",
          );
        uploadedCount.current = i + 1;
      }
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack" aria-busy={busy}>
      <p className="form-intro">
        أدخل بيانات المنتج وأسعاره. الحقول المميزة بـ * مطلوبة.
      </p>
      <fieldset disabled={busy} className="form-stack">
        <div className="form-grid">
          <Field label="اسم المنتج *">
            <input
              name="name"
              required
              autoFocus
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
          <Field
            label="الباركود *"
            hint="امسح الرمز أو احتفظ بالرمز المُنشأ تلقائيًا."
          >
            <input
              name="barcode"
              required
              defaultValue={product?.barcode || barcode || `MK${generated}`}
              dir="ltr"
            />
          </Field>
          <Field label="رمز المنتج (SKU) *">
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
          <Field
            label="الحد الأدنى للمخزون"
            hint="يظهر تنبيه عندما تصل الكمية إلى هذا الحد."
          >
            <input
              name="minimum"
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              defaultValue={(product?.minimum ?? 5000) / 1000}
            />
          </Field>
          <Field label="سعر الشراء (₺ / وحدة)">
            <input
              name="purchasePrice"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={(product?.purchase_price || 0) / 100}
            />
          </Field>
          <Field label="سعر البيع (₺ / وحدة)">
            <input
              name="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
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
                step="0.01"
                inputMode="decimal"
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
        <Field
          label="صور المنتج — حتى 8 صور"
          hint="JPEG أو PNG أو WebP. تُضغط الصور تلقائيًا لتسريع عرضها."
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              const f = Array.from(e.target.files || []);
              if (f.length > 8) {
                setError("اختر حتى 8 صور في المرة الواحدة.");
                e.target.value = "";
                return;
              }
              if (
                f.some(
                  (file) =>
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    ),
                )
              ) {
                setError("اختر صورًا بصيغة JPEG أو PNG أو WebP.");
                e.target.value = "";
                return;
              }
              setError("");
              uploadedCount.current = 0;
              setFiles(f);
              setPreviews(f.map(URL.createObjectURL));
            }}
          />
        </Field>
        <div className="preview-images">
          {previews.map((s) => (
            <img key={s} src={s} alt="معاينة صورة المنتج" />
          ))}
        </div>
      </fieldset>
      <ErrorBox error={error} />
      <button type="submit" disabled={busy} className="primary">
        {busy ? (
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
        ) : (
          <Save size={18} aria-hidden="true" />
        )}
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
