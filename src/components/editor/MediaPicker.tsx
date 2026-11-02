"use client";

import { useRef, useState } from "react";
import { uploadImageAction } from "@/app/admin/editor-actions";
import { ICON_NAMES, Media, type MediaValue } from "@/components/form/Media";
import { inputCls, smallBtn } from "./fields";

type Props = {
  formId: string;
  value: MediaValue;
  onChange: (m: MediaValue) => void;
  allowIcon?: boolean;
  label?: string;
};

/** Add an image (upload or URL) or an icon/emoji to a question, option or screen. */
export function MediaPicker({ formId, value, onChange, allowIcon = true, label = "Image or icon" }: Props) {
  const [mode, setMode] = useState<"none" | "url" | "icon">("none");
  const [url, setUrl] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadImageAction(formId, fd);
    setBusy(false);
    if (r.ok && r.url) {
      onChange({ kind: "image", url: r.url, alt: "" });
      setMode("none");
    } else if (!r.ok) {
      setError(r.error);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {value && (
        <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-2">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded bg-white text-xl text-gray-700">
            <Media media={value} className={value.kind === "image" ? "h-12 w-12" : "h-6 w-6"} />
          </div>
          {value.kind === "image" && (
            <input
              aria-label="Image description for screen readers"
              placeholder="Describe the image (for accessibility)"
              className={inputCls}
              value={value.alt ?? ""}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
          )}
          <button type="button" className={smallBtn} onClick={() => onChange(undefined)}>Remove</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallBtn} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Upload image"}</button>
        <button type="button" className={smallBtn} onClick={() => setMode(mode === "url" ? "none" : "url")}>Image URL</button>
        {allowIcon && <button type="button" className={smallBtn} onClick={() => setMode(mode === "icon" ? "none" : "icon")}>Icon / emoji</button>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>

      {mode === "url" && (
        <div className="flex gap-2">
          <input className={inputCls} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button
            type="button"
            className={smallBtn}
            onClick={() => {
              if (!/^https:\/\/\S+$/i.test(url)) return setError("Use a full https:// image URL");
              onChange({ kind: "image", url, alt: "" });
              setUrl("");
              setError(null);
              setMode("none");
            }}
          >
            Use
          </button>
        </div>
      )}

      {mode === "icon" && (
        <div className="space-y-2 rounded-md border border-gray-200 p-2">
          <div className="grid grid-cols-7 gap-1">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={`Icon ${name}`}
                onClick={() => {
                  onChange({ kind: "icon", name });
                  setMode("none");
                }}
                className="grid h-9 place-items-center rounded hover:bg-indigo-50"
              >
                <Media media={{ kind: "icon", name }} className="h-5 w-5 text-gray-700" />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Or type an emoji, e.g. 🏠" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} />
            <button
              type="button"
              className={smallBtn}
              onClick={() => {
                if (!emoji.trim()) return;
                onChange({ kind: "icon", name: emoji.trim() });
                setEmoji("");
                setMode("none");
              }}
            >
              Use
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
