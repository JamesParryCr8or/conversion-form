"use client";

import { useState } from "react";
import { btnGhost } from "./ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed"); // clipboard blocked: the text is still selectable on screen
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" onClick={copy} className={btnGhost}>
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy manually" : label}
    </button>
  );
}
