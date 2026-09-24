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
export type InventoryFilters = {
  category: string;
  stock: "all" | "available" | "low" | "empty";
  warehouse: string;
  sort:
    | "name-asc"
    | "name-desc"
    | "quantity-asc"
    | "quantity-desc"
    | "price-asc"
    | "price-desc";
};
export const inventoryDefaults: InventoryFilters = {
  category: "",
  stock: "all",
  warehouse: "",
  sort: "name-asc",
};
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
  categories?: string[];
  totalProducts?: number;
  pageCount?: number;
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
  product?: Product;
  items: Record<string, string | number>[];
  lines: Record<string, string | number>[];
  prices: Record<string, string | number>[];
  batches: Batch[];
  images: { id: string }[];
  error?: string;
};
export class ApiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}
export async function readApiResponse<T>(
  r: Response,
  fallback: string,
): Promise<T> {
  let result: Record<string, unknown> | null = null;
  try {
    const body: unknown = await r.json();
    if (body && typeof body === "object" && !Array.isArray(body))
      result = body as Record<string, unknown>;
  } catch {
    // A proxy or expired session can return HTML instead of API JSON.
  }
  if (!r.ok) {
    const message =
      typeof result?.error === "string" && result.error.trim()
        ? result.error
        : r.status === 401
          ? "انتهت الجلسة. سجّل الدخول مرة أخرى."
          : r.status === 429
            ? "طلبات كثيرة. انتظر قليلًا وحاول مجددًا."
            : fallback;
    throw new ApiRequestError(message, r.status);
  }
  if (!result) throw new ApiRequestError(fallback + ". حاول مجددًا.", r.status);
  return result as T;
}
async function request(url: string, options?: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiRequestError(
      "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.",
      0,
    );
  }
}
export async function api(data: unknown) {
  const r = await request("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readApiResponse<ApiResult>(r, "تعذرت العملية");
}
export async function get(view: string, signal?: AbortSignal) {
  const r = await request("/api/inventory?view=" + view, { signal });
  return readApiResponse<ReadResult>(r, "تعذر التحميل");
}
