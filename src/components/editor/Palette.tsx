"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BLOCKS, type Block } from "@/lib/funnel/editing";
import { BLOCK_ICONS } from "./icons";
import { inputCls } from "./fields";

const GROUPS: Block["group"][] = ["Contact", "Text", "Choices", "Numbers & dates", "Rating", "Display", "Other"];

/** Block picker, grouped like a field palette. Click a block to add it after the selected question. */
export function Palette({ onPick, onClose }: { onPick: (b: Block) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const matches = (b: Block) => !q || b.label.toLowerCase().includes(q) || b.description.toLowerCase().includes(q) || b.group.toLowerCase().includes(q);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add a block" className="max-h-[85dvh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-200 p-3">
          <Search className="h-4 w-4 text-gray-400" aria-hidden />
          <input ref={searchRef} className={`${inputCls} border-0 focus:ring-0`} placeholder="Search blocks…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-900"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(85dvh-60px)] space-y-5 overflow-y-auto p-4">
          {GROUPS.map((g) => {
            const blocks = BLOCKS.filter((b) => b.group === g && matches(b));
            if (!blocks.length) return null;
            return (
              <section key={g}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {blocks.map((b) => {
                    const Icon = BLOCK_ICONS[b.icon];
                    return (
                      <button key={b.id} type="button" onClick={() => onPick(b)} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-indigo-400 hover:bg-indigo-50/40">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-indigo-50 text-indigo-600">{Icon && <Icon className="h-4 w-4" aria-hidden />}</span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900">{b.label}</span>
                          <span className="block text-xs text-gray-500">{b.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!BLOCKS.some(matches) && <p className="text-sm text-gray-500">No blocks match &ldquo;{query}&rdquo;.</p>}
        </div>
      </div>
    </div>
  );
}
