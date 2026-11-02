"use client";

import { AlertCircle, Flag, GripVertical, Hand, Plus } from "lucide-react";
import { useState } from "react";
import type { EditorIssues } from "@/lib/funnel/editing";
import type { Funnel } from "@/lib/funnel/schema";
import { iconFor } from "./icons";

export type Selection = { kind: "welcome" } | { kind: "question"; key: string } | { kind: "end"; key: string };

type Props = {
  funnel: Funnel;
  sel: Selection;
  onSelect: (s: Selection) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
  onAddEnding: () => void;
  issues: EditorIssues;
};

/** Left column: welcome screen, questions (drag to reorder) and endings. */
export function Outline({ funnel, sel, onSelect, onMove, onAdd, onAddEnding, issues }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(sel);
  const item = (active: boolean) =>
    `group flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm transition ${active ? "border-indigo-500 bg-indigo-50" : "border-transparent hover:bg-gray-100"}`;

  return (
    <nav aria-label="Form outline" className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        <button type="button" className={item(isSel({ kind: "welcome" }))} onClick={() => onSelect({ kind: "welcome" })}>
          <Hand className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
          <span className={`truncate ${funnel.welcome ? "text-gray-900" : "text-gray-400"}`}>{funnel.welcome ? funnel.welcome.title || "Welcome" : "Welcome screen (off)"}</span>
        </button>

        <p className="px-2 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Questions</p>
        <ol
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom !== null && dropAt !== null) onMove(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt);
            setDragFrom(null);
            setDropAt(null);
          }}
        >
          {funnel.questions.map((q, i) => {
            const Icon = iconFor(q);
            const bad = Boolean(issues.byQuestion[q.key]?.length);
            return (
              <li
                key={q.key}
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", q.key);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDropAt(null);
                }}
                className={`relative ${dragFrom === i ? "opacity-40" : ""}`}
              >
                {dropAt === i && dragFrom !== null && <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded bg-indigo-500" />}
                <button type="button" className={item(isSel({ kind: "question", key: q.key }))} onClick={() => onSelect({ kind: "question", key: q.key })}>
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 group-hover:text-gray-500" aria-hidden />
                  <span className="w-5 shrink-0 text-xs text-gray-400">{i + 1}</span>
                  <Icon className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                  <span className="truncate text-gray-900">{q.label || <em className="text-gray-400">Untitled</em>}</span>
                  {bad && <AlertCircle className="ml-auto h-4 w-4 shrink-0 text-red-600" aria-label="Has problems" />}
                </button>
                {dropAt === i + 1 && dragFrom !== null && i === funnel.questions.length - 1 && <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded bg-indigo-500" />}
              </li>
            );
          })}
        </ol>
        {funnel.questions.length === 0 && <p className="px-2 text-xs text-gray-500">No questions yet.</p>}
        <button type="button" onClick={onAdd} className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50">
          <Plus className="h-4 w-4" aria-hidden /> Add block
        </button>

        <p className="px-2 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Endings</p>
        {funnel.endScreens.map((e) => (
          <button key={e.key} type="button" className={item(isSel({ kind: "end", key: e.key }))} onClick={() => onSelect({ kind: "end", key: e.key })}>
            <Flag className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            <span className="truncate text-gray-900">{e.title || <em className="text-gray-400">Untitled</em>}</span>
            {e.isDefault && <span className="ml-auto shrink-0 rounded bg-gray-100 px-1.5 text-[10px] font-medium text-gray-600">DEFAULT</span>}
            {issues.byEnd[e.key]?.length ? <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has problems" /> : null}
          </button>
        ))}
        <button type="button" onClick={onAddEnding} className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add ending
        </button>
      </div>
      <p className="border-t border-gray-200 p-3 text-xs text-gray-500">Drag questions to reorder. One question shows per screen.</p>
    </nav>
  );
}
