"use client";

import { useState } from "react";
import { CopyButton } from "./CopyButton";
import { btnGhost, hint } from "./ui";

/** Everything needed to put a form on a client's site: script embed, plain iframe, link, and a live preview. */
export function EmbedPanel({ appUrl, slug }: { appUrl: string; slug: string }) {
  const [preview, setPreview] = useState(false);
  const link = `${appUrl}/f/${slug}`;
  const script = `<script src="${appUrl}/embed.js" data-cr8or-form="${slug}" async></script>`;
  const iframe = `<iframe src="${link}" title="Form" style="width:100%;height:700px;border:0" loading="lazy"></iframe>`;

  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <Snippet title="Recommended: script embed" help="Paste where the form should appear. It resizes automatically and passes UTM and ad-click parameters from the page through to the form." code={script} />
      <Snippet title="Plain iframe (if scripts are blocked)" help="For builders that don't allow scripts. Fixed height, so adjust 700px if the form is taller." code={iframe} />
      <Snippet title="Direct link" help="Share on its own, or use as a button link." code={link} />
      <div>
        <button type="button" onClick={() => setPreview((p) => !p)} className={btnGhost}>{preview ? "Hide preview" : "Preview the form"}</button>
        {preview && (
          <iframe src={link} title="Form preview" className="mt-3 h-[620px] w-full rounded-lg border border-gray-200 bg-white" />
        )}
        {preview && <p className={hint}>Submissions made in the preview are real and show up in the results.</p>}
      </div>
    </div>
  );
}

function Snippet({ title, help, code }: { title: string; help: string; code: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <CopyButton text={code} />
      </div>
      <pre className="mt-1 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100"><code>{code}</code></pre>
      <p className={hint}>{help}</p>
    </div>
  );
}
