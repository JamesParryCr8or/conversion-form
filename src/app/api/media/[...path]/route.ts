/**
 * Serves form images from the PRIVATE Blob store. Only files under forms/ are served,
 * so this route can't be used to read anything else in the store.
 * (The SDK's get() is refused for private stores here, so this fetches the private URL directly.)
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const { path } = await ctx.params;
  const pathname = path.map(decodeURIComponent).join("/");
  if (!/^forms\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,40}\.(png|jpg|webp|gif)$/.test(pathname)) {
    return new Response("Not found", { status: 404 });
  }
  const storeId = process.env.BLOB_STORE_ID;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!storeId || !token) return new Response("Not found", { status: 404 });

  const host = storeId.replace(/^store_/, "").toLowerCase(); // the hostname has no store_ prefix
  const upstream = await fetch(`https://${host}.private.blob.vercel-storage.com/${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) return new Response("Not found", { status: 404 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
