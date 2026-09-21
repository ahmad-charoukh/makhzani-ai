import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { allowed, type Role } from "./domain";
export const db = () => {
  const d = (env as unknown as { DB: D1Database }).DB;
  if (!d) throw new Error("قاعدة البيانات غير متاحة");
  return d;
};
export const bucket = () => (env as unknown as { BUCKET: R2Bucket }).BUCKET;
export const uid = () => crypto.randomUUID();
export type Context = {
  business: string;
  actor: string;
  role: Role;
  email: string;
  ip?: string;
};
export async function identity() {
  const u = await getChatGPTUser();
  if (!u) throw new ApiError(401, "يرجى تسجيل الدخول");
  return u;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function context(action = "read"): Promise<Context> {
  const u = await identity();
  const row = await db()
    .prepare(
      "SELECT m.business_id,m.role FROM members m WHERE m.email=? AND m.active=1 ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(u.email.toLowerCase())
    .first<{ business_id: string; role: Role }>();
  if (!row) throw new ApiError(403, "أنشئ مخزنك أو اطلب من المالك إضافتك");
  if (!allowed(row.role, action))
    throw new ApiError(403, "ليس لديك صلاحية لهذه العملية");
  return {
    business: row.business_id,
    actor: u.userId,
    role: row.role,
    email: u.email,
    ip: (await headers()).get("cf-connecting-ip") || undefined,
  };
}
export function statement(sql: string, ...args: unknown[]) {
  return db()
    .prepare(sql)
    .bind(...args);
}
export async function rows<T = Record<string, unknown>>(
  sql: string,
  ...args: unknown[]
) {
  return (await statement(sql, ...args).all<T>()).results;
}
export function audit(
  c: Context,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
  reason = "",
  ip = "",
) {
  return statement(
    "INSERT INTO audit_logs(id,business_id,actor,action,entity,before,after,reason,ip) VALUES(?,?,?,?,?,?,?,?,?)",
    uid(),
    c.business,
    c.actor,
    action,
    entity,
    JSON.stringify(before),
    JSON.stringify(after),
    reason,
    ip || c.ip || "",
  );
}
export async function owned(
  table: "products" | "suppliers" | "warehouses" | "purchases",
  id: string,
  c: Context,
) {
  const r = await statement(
    `SELECT * FROM ${table} WHERE id=? AND business_id=?`,
    id,
    c.business,
  ).first();
  if (!r) throw new ApiError(404, "العنصر غير موجود");
  return r;
}
export function mutationGuard(r: Request) {
  const o = r.headers.get("origin");
  if (o !== new URL(r.url).origin) throw new ApiError(403, "طلب غير مسموح");
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "صيغة غير مدعومة");
}
export function errorResponse(e: unknown) {
  console.error(e);
  const message = e instanceof Error ? e.message : "";
  const conflict =
    /UNIQUE|quantity|CHECK constraint|stock|stale|negative|immutable|scope/.test(
      message,
    );
  return Response.json(
    {
      error:
        e instanceof ApiError
          ? e.message
          : conflict
            ? "تعارض في البيانات أو كمية غير متاحة. حدّث الصفحة وحاول مجددًا."
            : "تعذر حفظ العملية، حاول مرة أخرى.",
    },
    { status: e instanceof ApiError ? e.status : conflict ? 409 : 500 },
  );
}

export async function rateLimit(actor: string) {
  const window = Math.floor(Date.now() / 60000);
  const r = await statement(
    "INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    actor,
    window,
  ).first<{ count: number }>();
  if (r && r.count > 90)
    throw new ApiError(429, "طلبات كثيرة؛ انتظر دقيقة وحاول مجددًا");
}

export async function readLimited(r: Request, limit: number) {
  const reader = r.body?.getReader();
  if (!reader) throw new ApiError(400, "طلب فارغ");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "حجم الطلب كبير جدًا");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
