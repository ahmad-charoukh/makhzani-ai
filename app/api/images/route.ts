import {
  ApiError,
  audit,
  context,
  db,
  errorResponse,
  owned,
  rateLimit,
  readLimited,
  rows,
  statement,
  uid,
} from "@/lib/server";
import {
  deleteImage,
  putImage,
  storagePath,
} from "@/lib/supabase-storage";

export async function POST(r: Request) {
  try {
    if (r.headers.get("origin") !== new URL(r.url).origin)
      throw new ApiError(403, "طلب غير مسموح");

    const c = await context("products");
    await rateLimit(c.actor);

    if (Number(r.headers.get("content-length")) > 6000000)
      throw new ApiError(413, "حجم الصورة كبير");

    const f = await new Response(await readLimited(r, 6000000), {
      headers: {
        "Content-Type": r.headers.get("content-type") || "",
      },
    }).formData();

    const productId = String(f.get("productId"));
    await owned("products", productId, c);

    const files = await rows(
      "SELECT id FROM images WHERE product_id=?",
      productId,
    );

    if (files.length >= 8)
      throw new ApiError(400, "الحد الأقصى 8 صور");

    const file = f.get("file");

    if (!(file instanceof File) || file.size > 5000000)
      throw new ApiError(400, "اختر صورة أصغر من 5 ميغابايت");

    const bytes = new Uint8Array(await file.arrayBuffer());

    const jpeg =
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;

    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (v, i) => bytes[i] === v,
    );

    const webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

    const mime = jpeg
      ? "image/jpeg"
      : png
        ? "image/png"
        : webp
          ? "image/webp"
          : null;

    if (!mime || file.type !== mime)
      throw new ApiError(
        400,
        "الصورة يجب أن تكون JPEG أو PNG أو WebP",
      );

    const id = uid();
    const path = storagePath(c.business, id);

    await putImage(path, bytes, mime);

    try {
      await db().batch([
        statement(
          "INSERT INTO images(id,business_id,product_id,mime,size) VALUES(?,?,?,?,?)",
          id,
          c.business,
          productId,
          mime,
          file.size,
        ),
        audit(
          c,
          "image.upload",
          productId,
          null,
          { id, size: file.size },
        ),
      ]);
    } catch (e) {
      try {
        await deleteImage(path);
      } catch (cleanupError) {
        console.error("Supabase image cleanup failed", cleanupError);
      }

      throw e;
    }

    return Response.json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
