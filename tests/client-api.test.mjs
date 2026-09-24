import test from "node:test";
import assert from "node:assert/strict";
import {
  api,
  get,
  readApiResponse,
  ApiRequestError,
} from "../components/makhzani/types.ts";

test("client preserves safe API errors and their status", async () => {
  await assert.rejects(
    readApiResponse(
      Response.json(
        { error: "الكمية المطلوبة أكبر من المخزون المتاح" },
        { status: 409 },
      ),
      "تعذرت العملية",
    ),
    (error) =>
      error instanceof ApiRequestError &&
      error.status === 409 &&
      error.message === "الكمية المطلوبة أكبر من المخزون المتاح",
  );
});

test("client handles HTML errors and invalid success bodies without raw parser errors", async () => {
  for (const status of [200, 502]) {
    await assert.rejects(
      readApiResponse(
        new Response("<html>Gateway error</html>", { status }),
        "تعذر التحميل",
      ),
      (error) =>
        error instanceof ApiRequestError &&
        error.message.startsWith("تعذر التحميل") &&
        !error.message.includes("<html>"),
    );
  }
  await assert.rejects(
    readApiResponse(new Response("expired", { status: 401 }), "تعذر التحميل"),
    /انتهت الجلسة/,
  );
  assert.deepEqual(
    await readApiResponse(Response.json({ ok: true }), "تعذر التحميل"),
    { ok: true },
  );
});

test("client network failures give a useful retry message", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(get("inventory"), /تحقق من الإنترنت/);
    await assert.rejects(api({ type: "stock" }), /تحقق من الإنترنت/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
