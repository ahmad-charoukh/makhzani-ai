import { safeRelativeReturnPath } from "@/app/chatgpt-auth";

export async function GET(r: Request) {
  const url = new URL(r.url);

  const returnTo = safeRelativeReturnPath(
    url.searchParams.get("return_to") || "/",
  );

  const secure =
    url.protocol === "https:" ? "; Secure" : "";

  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(returnTo, r.url).toString(),
      "Set-Cookie":
        `makhzani_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    },
  });
}
