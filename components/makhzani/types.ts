export type Product = {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  category: string;
  subcategory: string;
  brand: string;
  description: string;
  unit: string;
  minimum: number;
  quantity: number;
  purchase_price?: number;
  selling_price: number;
  tax: number;
  supplier_id: string;
  shelf: string;
  notes: string;
  expiry_enabled: number;
  image_id?: string;
  reorder: { daily: number; days: number | null; suggested: number };
};
export type Warehouse = { id: string; name: string; branch: string };
export type Movement = {
  id: string;
  name: string;
  unit: string;
  delta: number;
  kind: string;
  warehouse: string;
  reason: string;
  actor: string;
  created_at: string;
};
export type Batch = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  expires: string | null;
  lot: string;
  warehouse: string;
  warehouse_id: string;
};
export type Snapshot = {
  products: Product[];
  warehouses: Warehouse[];
  stats: {
    products: number;
    quantity: number;
    low: number;
    empty: number;
    value?: number;
  };
  low: Product[];
  expiry: Batch[];
  daily: { day: string; incoming: number; outgoing: number; count: number }[];
  movements: Movement[];
  business: { name: string };
  role: "owner" | "manager" | "employee";
  email: string;
  page: number;
  hasMore: boolean;
};
export const kindLabels: Record<string, string> = {
  in: "إدخال بضاعة",
  out: "إخراج بضاعة",
  count: "جرد",
  transfer: "نقل بضاعة",
  damaged: "تالف",
  lost: "ضائع",
  supplier_return: "مرتجع للمورد",
  customer_return: "مرتجع من العميل",
};
export const purchaseLabels: Record<string, string> = {
  draft: "مسودة",
  sent: "تم الإرسال",
  confirmed: "تم التأكيد",
  partial: "وصل جزء",
  received: "تم الاستلام",
  cancelled: "ملغي",
};
export const units = [
  "قطعة",
  "علبة",
  "كرتون",
  "كغم",
  "غرام",
  "لتر",
  "مل",
  "متر",
];
export const number = (n: number) =>
  new Intl.NumberFormat("ar", { maximumFractionDigits: 3 }).format(n);
export type ApiResult = {
  id: string;
  text: string;
  error?: string;
  draft?: { productId: string; quantity: number; kind: string };
};
export type ReadResult = Snapshot & {
  items: Record<string, string | number>[];
  lines: Record<string, string | number>[];
  prices: Record<string, string | number>[];
  batches: Batch[];
  images: { id: string }[];
  error?: string;
};
export async function api(data: unknown) {
  const r = await fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await r.json()) as ApiResult;
  if (!r.ok) throw Error(result.error || "تعذرت العملية");
  return result;
}
export async function get(view: string) {
  const r = await fetch("/api/inventory?view=" + view);
  const data = (await r.json()) as ReadResult;
  if (!r.ok) throw Error(data.error || "تعذر التحميل");
  return data;
}
