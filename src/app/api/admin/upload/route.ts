import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { getAdmin } from "@/server/admin-auth";

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Image upload for the form builder. Admin only. Files are stored privately and served by /api/media. */
export async function POST(req: Request) {
  if (!(await getAdmin())) return Response.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  const formId = new URL(req.url).searchParams.get("formId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(formId)) return Response.json({ ok: false, error: "Unknown form." }, { status: 400 });
  const [form] = await db.select({ id: schema.forms.id }).from(schema.forms).where(eq(schema.forms.id, formId)).limit(1);
  if (!form) return Response.json({ ok: false, error: "Unknown form." }, { status: 404 });

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return Response.json({ ok: false, error: "Use a PNG, JPG, WebP or GIF image." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return Response.json({ ok: false, error: "Images must be 5 MB or smaller." }, { status: 413 });

  const pathname = `forms/${formId}/${nanoid(10)}.${ext}`;
  // Raw Blob API call (the SDK's put() is refused in this setup; this request is accepted).
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return Response.json({ ok: false, error: "Upload isn't set up: BLOB_READ_WRITE_TOKEN is missing." }, { status: 500 });
  const res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-vercel-blob-access": "private",
      "x-add-random-suffix": "0",
      "x-content-type": file.type,
    },
    body: file,
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? (await res.text().catch(() => "")).slice(0, 200) : "network error";
    console.error("[upload] failed:", res?.status, detail);
    return Response.json({ ok: false, error: `Upload failed (${res?.status ?? "network"}): ${detail}` }, { status: 502 });
  }
  return Response.json({ ok: true, url: `/api/media/${pathname}` });
}
