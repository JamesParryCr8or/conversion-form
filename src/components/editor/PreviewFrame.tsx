"use client";

import { Component, type ReactNode } from "react";
import { FormRenderer } from "@/components/form/FormRenderer";
import type { Funnel } from "@/lib/funnel/schema";

/** Live preview of the real form component, in preview mode (nothing saved). */
export function PreviewFrame({ funnel, startAt, device, nonce = 0 }: { funnel: Funnel; startAt: string | null; device: "mobile" | "desktop"; nonce?: number }) {
  const resetKey = `${startAt ?? "start"}:${nonce}`;
  return (
    <div className="flex h-full justify-center overflow-y-auto bg-gray-100 p-4">
      <div
        className={`h-fit min-h-[520px] overflow-hidden bg-white shadow-sm ring-1 ring-gray-200 transition-all ${device === "mobile" ? "w-[390px] rounded-[28px]" : "w-full max-w-4xl rounded-xl"}`}
        style={{ backgroundColor: funnel.form.theme.backgroundColor }}
      >
        <PreviewBoundary resetKey={resetKey}>
          <FormRenderer key={resetKey} slug="preview" funnel={funnel} preview startAt={startAt} />
        </PreviewBoundary>
      </div>
    </div>
  );
}

/** If a half-finished block can't render, show a note instead of breaking the whole builder. */
class PreviewBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="p-8 text-center text-sm text-gray-500">The preview can&apos;t show this step until its problems are fixed.</p>
    ) : (
      this.props.children
    );
  }
}
