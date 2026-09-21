"use client";
import { useEffect, useState } from "react";
import { ScanLine, CheckCircle2 } from "lucide-react";
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
const Scanner=dynamic(()=>import("./scanner"),{ssr:false});
export default function StockForm({
  kind,
  data,
  initial,
  saved,
  unknown,
}: {
  kind: string;
  data: Snapshot;
  initial?: { productId?: string; quantity?: number };
  saved: () => void;
  unknown: (code: string) => void;
}) {
  const [product, setProduct] = useState<Product | undefined>(
    data.products.find((p) => p.id === initial?.productId),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>(data.products);
  const [quantity, setQuantity] = useState(String(initial?.quantity || ""));
  const [warehouse, setWarehouse] = useState(data.warehouses[0]?.id || "");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ready, setReady] = useState(false);
  const [scan, setScan] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (initial?.productId)
      void get("detail&id=" + initial.productId)
        .then((d) => {
          setBatches(d.batches);
          setReady(true);
        })
        .catch((e) => setError(e.message));
  }, [initial?.productId]);
  async function select(p: Product) {
    setProduct(p);
    setReady(false);
    const d = await get("detail&id=" + p.id);
    setBatches(d.batches);
    setReady(true);
  }
  async function search(code: string, scanned = false) {
    setQuery(code);
    setScan(false);
    try {
      const d = await get("dashboard&q=" + encodeURIComponent(code));
      setResults(d.products);
      const exact = d.products.find(
        (p: Product) => p.barcode === code || p.sku === code || p.id === code,
      );
      if (exact) await select(exact);
      else if (scanned && d.products.length === 0) unknown(code);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const current =
    batches
      .filter((b) => b.warehouse_id === warehouse)
      .reduce((n, b) => n + b.quantity, 0) / 1000;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!product) return;
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
    if (!navigator.onLine) {
      const drafts = JSON.parse(localStorage.getItem("mk-drafts") || "[]");
      drafts.push({ ...body, email: data.email });
      localStorage.setItem("mk-drafts", JSON.stringify(drafts));
      saved();
      return;
    }
    try {
      await api(body);
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <div className="scan-search">
        <input
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
          onClick={() => search(query)}
        >
          بحث
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="فتح الكاميرا"
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
                <small>{p.barcode}</small>
              </span>
              <b>
                {number(p.quantity / 1000)} {p.unit}
              </b>
            </button>
          ))}
          {!results.length && (
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
              }}
            >
              تغيير
            </button>
          </div>
          {!ready ? (
            <button
              type="button"
              className="secondary"
              onClick={() => select(product)}
            >
              إعادة تحميل الكمية
            </button>
          ) : (
            <>
              <div className="form-grid">
                <Field label="المخزن">
                  <select
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
                <Field label={kind === "count" ? "الكمية الفعلية" : "الكمية"}>
                  <input
                    autoFocus
                    type="number"
                    required
                    min={kind === "count" ? 0 : 0.001}
                    step="0.001"
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
                {kind === "count" && (
                  <span>الفرق: {number(Number(quantity) - current)}</span>
                )}
              </div>
              {kind === "transfer" && (
                <Field label="إلى المخزن">
                  <select name="to" required>
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
                        required={!!product.expiry_enabled && kind !== "count"}
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
              <button disabled={busy} className="primary">
                <CheckCircle2 size={19} />
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
      <ErrorBox error={error} />
    </form>
  );
}
