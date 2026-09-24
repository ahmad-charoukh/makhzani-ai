import {
  ApiError,
  context,
  errorResponse,
  statement,
} from "@/lib/server";
import {
  getImage,
  storagePath,
} from "@/lib/supabase-storage";

export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const c = await context("images.read");
    const { id } = await params;

    const row = await statement(
      "SELECT mime FROM images WHERE id=? AND business_id=?",
      id,
      c.business,
    ).first<{ mime: string }>();

    if (!row)
      throw new ApiError(404, "الصورة غير موجودة");

    const image = await getImage(
      storagePath(c.business, id),
    );

    if (!image)
      throw new ApiError(404, "الصورة غير موجودة");

    return new Response(image.stream(), {
      headers: {
        "Content-Type": row.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
