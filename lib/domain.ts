export type Role = "owner" | "manager" | "employee";
export function allowed(role: Role, action: string) {
  return (
    role === "owner" ||
    (role === "manager" && !["members", "settings"].includes(action)) ||
    (role === "employee" &&
      ["read", "stock", "count", "assistant", "images.read"].includes(action))
  );
}
export function scaled(n: number) {
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > 1e9 ||
    Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-5
  )
    throw Error("الكمية غير صالحة؛ الحد الأقصى ثلاث منازل عشرية");
  return Math.round(n * 1000);
}
export function allocate<
  T extends { id: string; quantity: number; expires?: string | null },
>(rows: T[], amount: number) {
  let left = amount;
  const parts: { batch: T; amount: number }[] = [];
  for (const batch of rows) {
    const take = Math.min(left, batch.quantity);
    if (take > 0) parts.push({ batch, amount: take });
    left -= take;
    if (left === 0) break;
  }
  if (left > 0) throw Error("الكمية المطلوبة أكبر من المتوفر");
  return parts;
}
export function reorder(quantity: number, out30: number, min: number) {
  const daily = out30 / 30;
  return {
    daily: daily / 1000,
    days: daily > 0 ? Math.floor(quantity / daily) : null,
    suggested: Math.max(
      0,
      Math.ceil((Math.max(min, daily * 14) - quantity) / 1000),
    ),
  };
}
export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}
export const statusTransitions: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  partial: [],
  received: [],
  cancelled: [],
};
