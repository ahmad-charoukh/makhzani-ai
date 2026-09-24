"use client";
import { useEffect, useRef, useState } from "react";
import { ScanLine, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  api,
  get,
  kindLabels,
  number,
  type Product,
  type Snapshot,
  type Batch,
} from "./types";
import { Field, ErrorBox, ProductIcon } from "./primitives";
import dynamic from "next/dynamic";
const Scanner = dynamic(() => import("./scanner"), { ssr: false });
export default function StockForm({
  kind,
  data,
  initial,
  initialWarehouseId,
  saved,
  unknown,
}: {
  kind: string;
  data: Snapshot;
  initial?: { productId?: string; quantity?: number };
  initialWarehouseId?: string;
  saved: () => void;
  unknown: (code: string) => void;
}) {
  const [product, setProduct] = useState<Product | undefined>(
    data.products.find((p) => p.id === initial?.productId) ||
      (initial?.productId ? ({ id: initial.productId } as Product) : undefined),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>(data.products);
  const [quantity, setQuantity] = useState(
    String(
      initial?.quantity === 0 && kind !== "count"
        ? ""
        : (initial?.quantity ?? ""),
    ),
  );
  const [warehouse, setWarehouse] = useState(
    data.warehouses.some((item) => item.id === initialWarehouseId)
      ? initialWarehouseId!
      : data.warehouses[0]?.id || "",
  );
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ready, setReady] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(!!initial?.productId);
  const [detailVersion, setDetailVersion] = useState(0);
  const searchRequest = useRef(0);
  const [opId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    if (product?.id)
      void get("detail&id=" + encodeURIComponent(product.id))
        .then((d) => {
          if (!active) return;
          setBatches(d.batches);
          if (d.product) {
            const detailProduct = d.product;
            setProduct((currentProduct) => ({
              ...currentProduct,
              ...detailProduct,
              quantity: d.batches.reduce(
                (sum, batch) => sum + batch.quantity,
                0,
              ),
            }));
          }
          setReady(true);
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        })
        .finally(() => {
          if (active) setLoadingDetail(false);
        });
    return () => {
      active = false;
    };
  }, [product?.id, detailVersion]);
  function select(p: Product) {
    searchRequest.current += 1;
    setSearching(false);
    setError("");
    if (product && product.id !== p.id) setQuantity("");
    setProduct(p);
    setReady(false);
    setBatches([]);
    setLoadingDetail(true);
    setDetailVersion((version) => version + 1);
  }
  async function search(code: string, scanned = false) {
    const request = ++searchRequest.current;
    code = code.trim();
    setQuery(code);
    setScan(false);
    setSearching(true);
    setError("");
    try {
      const d = await get("dashboard&q=" + encodeURIComponent(code));
      if (request !== searchRequest.current) return;
      setResults(d.products);
      const exact = d.products.find(
        (p: Product) => p.barcode === code || p.sku === code || p.id === code,
      );
      if (exact) select(exact);
      else {
        setProduct(undefined);
        setReady(false);
        setBatches([]);
        setQuantity("");
        if (scanned && d.products.length === 0 && code) unknown(code);
      }
    } catch (e) {
      if (request === searchRequest.current) setError((e as Error).message);
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }
  const current =
    batches
      .filter((b) => b.warehouse_id === warehouse)
      .reduce((n, b) => n + b.quantity, 0) / 1000;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!product || !ready || !warehouse) {
      setError("اختر المنتج والمخزن وانتظر تحميل الكمية قبل الحفظ.");
      return;
    }
    if (
      ["out", "transfer", "damaged", "lost", "supplier_return"].includes(
        kind,
      ) &&
      Number(quantity) > current
    ) {
      setError("الكمية المطلوبة أكبر من المتوفر في هذا المخزن.");
      return;
    }
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const body = {
      type: "stock",
      id: opId,
      productId: product.id,
      warehouseId: warehouse,
      kind,
      quantity: Number(quantity),
      expected: current,
      toWarehouseId: f.get("to") || undefined,
      lot: f.get("lot") || undefined,
      expires: f.get("expires") || undefined,
      reason: f.get("reason") || "",
      invoice: f.get("invoice") || "",
    };
    try {
      if (!navigator.onLine) {
        try {
          const drafts = JSON.parse(localStorage.getItem("mk-drafts") || "[]");
          if (!Array.isArray(drafts)) throw Error();
          drafts.push({
            ...body,
            email: data.email,
            productName: product.name,
            unit: product.unit,
            warehouseName: data.warehouses.find((item) => item.id === warehouse)
              ?.name,
          });
          localStorage.setItem("mk-drafts", JSON.stringify(drafts));
        } catch {
          throw Error(
            "تعذر حفظ المسودة على هذا الجهاز. اتصل بالإنترنت وحاول مجددًا.",
          );
        }
        saved();
        return;
      }
      await api(body);
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
        اختر المنتج والمخزن، ثم راجع الكمية قبل تأكيد الحركة.
      </p>
      <fieldset className="form-stack" disabled={busy}>
        <div className="scan-search">
          <input
            aria-label="البحث عن منتج بالاسم أو الباركود"
            type="search"
            placeholder="اسم المنتج أو الباركود…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search(query, true);
              }
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={searching}
            onClick={() => search(query)}
          >
            {searching ? "جارٍ البحث…" : "بحث"}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="فتح الكاميرا"
            aria-pressed={scan}
            onClick={() => setScan(!scan)}
          >
            <ScanLine />
          </button>
        </div>
        {scan && <Scanner onScan={(code) => void search(code, true)} />}
        {!product ? (
          <div className="product-select">
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => select(p)}>
                <ProductIcon p={p} />
                <span>
                  {p.name}
                  <small>
                    <bdi>{p.barcode}</bdi> · {p.category}
                  </small>
                </span>
                <b>
                  {number(p.quantity / 1000)} {p.unit}
                </b>
              </button>
            ))}
            {!results.length && !searching && (
              <button type="button" onClick={() => unknown(query)}>
                هذا المنتج غير موجود — أضفه؟
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="selected-product">
              <ProductIcon p={product} />
              <div>
                <h3>{product.name}</h3>
                <span className="muted">{product.unit}</span>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setProduct(undefined);
                  setReady(false);
                  setBatches([]);
                  setQuantity("");
                  setError("");
                }}
              >
                تغيير
              </button>
            </div>
            {!ready ? (
              <button
                type="button"
                className="secondary"
                disabled={loadingDetail}
                onClick={() => select(product)}
              >
                {loadingDetail ? "جارٍ تحميل الكمية…" : "إعادة تحميل الكمية"}
              </button>
            ) : (
              <>
                <div className="form-grid">
                  <Field label="المخزن">
                    <select
                      required
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                    >
                      {data.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={`${kind === "count" ? "الكمية الفعلية" : "الكمية"} (${product.unit})`}
                  >
                    <input
                      autoFocus
                      type="number"
                      required
                      min={kind === "count" ? 0 : 0.001}
                      step="0.001"
                      inputMode="decimal"
                      max={
                        [
                          "out",
                          "transfer",
                          "damaged",
                          "lost",
                          "supplier_return",
                        ].includes(kind)
                          ? current
                          : undefined
                      }
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="quantity-preview">
                  <span>الموجود بالنظام</span>
                  <strong>
                    {number(current)} {product.unit}
                  </strong>
                  {kind === "count" && quantity !== "" && (
                    <span>
                      الفرق: {number(Number(quantity) - current)} {product.unit}
                    </span>
                  )}
                </div>
                {kind === "transfer" && (
                  <Field label="إلى المخزن">
                    <select name="to" required>
                      <option value="">اختر مخزن الوجهة</option>
                      {data.warehouses
                        .filter((w) => w.id !== warehouse)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                {["count", "damaged", "lost", "supplier_return"].includes(
                  kind,
                ) && (
                  <Field label="السبب *">
                    <input
                      name="reason"
                      required
                      placeholder="اكتب سبب تعديل الكمية"
                    />
                  </Field>
                )}
                {["in", "customer_return", "count"].includes(kind) && (
                  <details open={!!product.expiry_enabled}>
                    <summary>الدفعة والصلاحية والفاتورة</summary>
                    <div className="form-grid">
                      <Field label="رقم الدفعة">
                        <input name="lot" />
                      </Field>
                      <Field label="تاريخ الصلاحية">
                        <input
                          type="date"
                          name="expires"
                          required={
                            !!product.expiry_enabled && kind !== "count"
                          }
                        />
                      </Field>
                      <Field label="رقم الفاتورة">
                        <input name="invoice" />
                      </Field>
                    </div>
                  </details>
                )}
                {kind === "out" &&
                  batches.filter(
                    (b) => b.warehouse_id === warehouse && b.quantity > 0,
                  )[0]?.expires && (
                    <div className="info-box">
                      استخدم هذه الدفعة أولًا:{" "}
                      {
                        batches.filter(
                          (b) => b.warehouse_id === warehouse && b.quantity > 0,
                        )[0].lot
                      }
                    </div>
                  )}
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !warehouse ||
                    (kind === "transfer" && data.warehouses.length < 2)
                  }
                  className="primary"
                >
                  {busy ? (
                    <LoaderCircle
                      size={19}
                      className="spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2 size={19} aria-hidden="true" />
                  )}
                  {busy
                    ? "جارٍ الحفظ…"
                    : navigator.onLine
                      ? "تأكيد " + kindLabels[kind]
                      : "حفظ مسودة دون اتصال"}
                </button>
              </>
            )}
          </>
        )}
        {!data.warehouses.length && (
          <p className="info-box">
            أضف مخزنًا من قسم المخازن والفروع لتسجيل الحركات.
          </p>
        )}
        {kind === "transfer" && data.warehouses.length < 2 && (
          <p className="info-box">تحتاج إلى مخزنين على الأقل لنقل البضاعة.</p>
        )}
      </fieldset>
      <ErrorBox error={error} />
    </form>
  );
}
