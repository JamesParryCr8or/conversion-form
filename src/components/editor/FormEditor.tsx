"use client";

import { ChevronLeft, Monitor, Redo2, RotateCcw, Smartphone, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publishFormAction, saveDraftAction } from "@/app/admin/editor-actions";
import {
  addEndScreen, allKeys, duplicateQuestion, editorIssues, insertQuestion, moveQuestion, newQuestion, normalizeDraft,
  removeEndScreen, removeQuestion, renameOptionValue, renameQuestionKey, updateEndScreen, updateQuestion, type Block,
} from "@/lib/funnel/editing";
import type { Funnel, Question } from "@/lib/funnel/schema";
import { DesignPanel } from "./DesignPanel";
import { LogicEditor } from "./LogicEditor";
import { Outline, type Selection } from "./Outline";
import { Palette } from "./Palette";
import { PreviewFrame } from "./PreviewFrame";
import { QuestionProperties } from "./QuestionProperties";
import { EndProperties, WelcomeProperties } from "./ScreenProperties";

type Tab = "build" | "logic" | "design" | "preview";
type SaveState = "saved" | "unsaved" | "saving" | "error";

export type EditorProps = {
  formId: string;
  slug: string;
  initialDraft: unknown;
  initialName: string;
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  client: { id: string; name: string };
};

export function FormEditor(props: EditorProps) {
  const { formId, slug, client } = props;
  const [funnel, setFunnel] = useState<Funnel>(() => normalizeDraft(props.initialDraft, props.initialName));
  const [rawSel, setSel] = useState<Selection>(() => {
    const first = normalizeDraft(props.initialDraft, props.initialName).questions[0];
    return first ? { kind: "question", key: first.key } : { kind: "welcome" };
  });
  const [tab, setTab] = useState<Tab>("build");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);

  // Save / publish status
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const savedRev = useRef(0);
  const funnelRef = useRef(funnel);
  const [publishedVersion, setPublishedVersion] = useState(props.publishedVersion);
  const [unpublished, setUnpublished] = useState(props.hasUnpublishedChanges);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);

  // Undo / redo
  const pastRef = useRef<Funnel[]>([]);
  const futureRef = useRef<Funnel[]>([]);
  const [hist, setHist] = useState({ past: 0, future: 0 }); // lengths, for enabling the buttons
  const lastPush = useRef(0);

  const issues = useMemo(() => editorIssues(funnel), [funnel]);

  // If the selected step no longer exists (undo, delete, rename), fall back to the first question.
  const selValid =
    rawSel.kind === "welcome" ||
    (rawSel.kind === "question" && funnel.questions.some((q) => q.key === rawSel.key)) ||
    (rawSel.kind === "end" && funnel.endScreens.some((e) => e.key === rawSel.key));
  const sel: Selection = selValid ? rawSel : funnel.questions[0] ? { kind: "question", key: funnel.questions[0].key } : { kind: "welcome" };

  useEffect(() => {
    funnelRef.current = funnel;
  }, [funnel]);

  /** Every change goes through here: records undo history and schedules an autosave. */
  const update = useCallback((fn: (f: Funnel) => Funnel) => {
    const now = Date.now();
    if (now - lastPush.current > 700) pastRef.current = [...pastRef.current.slice(-49), funnelRef.current]; // rapid typing = one undo step
    lastPush.current = now;
    futureRef.current = [];
    setHist({ past: pastRef.current.length, future: 0 });
    setFunnel((current) => fn(current));
    setRev((r) => r + 1);
    setUnpublished(true);
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [funnelRef.current, ...futureRef.current];
    setHist({ past: pastRef.current.length, future: futureRef.current.length });
    setFunnel(prev);
    setRev((r) => r + 1);
    lastPush.current = 0;
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, funnelRef.current];
    setHist({ past: pastRef.current.length, future: futureRef.current.length });
    setFunnel(next);
    setRev((r) => r + 1);
    lastPush.current = 0;
  }, []);

  // Keyboard: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y. Text boxes keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Autosave ~0.8s after the last change.
  useEffect(() => {
    if (rev === savedRev.current) return;
    setSaveState("unsaved");
    const target = rev;
    const t = window.setTimeout(async () => {
      setSaveState("saving");
      const r = await saveDraftAction(formId, funnelRef.current);
      if (r.ok) {
        savedRev.current = Math.max(savedRev.current, target);
        setSaveState(savedRev.current === target ? "saved" : "unsaved");
        setSaveError(null);
      } else {
        setSaveState("error");
        setSaveError(r.error);
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [rev, formId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saveState === "unsaved" || saveState === "saving" || saveState === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [saveState]);

  async function publish() {
    setPublishing(true);
    setPublishMsg(null);
    const saved = await saveDraftAction(formId, funnelRef.current);
    if (!saved.ok) {
      setPublishing(false);
      setPublishMsg({ ok: false, text: saved.error });
      return;
    }
    savedRev.current = rev;
    setSaveState("saved");
    const r = await publishFormAction(formId);
    setPublishing(false);
    if (r.ok) {
      setPublishedVersion(r.version ?? null);
      setUnpublished(false);
      setPublishMsg({ ok: true, text: r.message ?? "Published." });
    } else {
      setPublishMsg({ ok: false, text: r.error, errors: r.errors });
    }
  }

  /* ---------- actions on the funnel ---------- */

  const addBlock = (block: Block) => {
    const q = newQuestion(block, allKeys(funnel));
    const at = sel.kind === "question" ? funnel.questions.findIndex((x) => x.key === sel.key) + 1 : funnel.questions.length;
    update((f) => insertQuestion(f, q, at));
    setSel({ kind: "question", key: q.key });
    setPaletteOpen(false);
  };

  const selectedQuestion = sel.kind === "question" ? funnel.questions.find((q) => q.key === sel.key) : undefined;
  const selectedEnd = sel.kind === "end" ? funnel.endScreens.find((e) => e.key === sel.key) : undefined;
  const previewStart = sel.kind === "question" ? sel.key : sel.kind === "end" ? sel.key : "welcome";

  const saveLabel = { saved: "All changes saved", unsaved: "Unsaved changes…", saving: "Saving…", error: "Couldn't save" }[saveState];
  const tabs: { id: Tab; label: string }[] = [
    { id: "build", label: "Build" },
    { id: "logic", label: `Logic${funnel.logic.length ? ` (${funnel.logic.length})` : ""}` },
    { id: "design", label: "Design" },
    { id: "preview", label: "Preview" },
  ];

  return (
    <div className="flex h-dvh flex-col bg-gray-50 text-gray-900">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
        <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" aria-hidden /> {client.name}
        </Link>
        <input
          aria-label="Form name"
          className="min-w-0 max-w-[16rem] rounded-md border border-transparent px-2 py-1 text-sm font-semibold hover:border-gray-300 focus:border-indigo-500 focus:outline-none"
          value={funnel.form.name}
          onChange={(e) => update((f) => ({ ...f, form: { ...f.form, name: e.target.value } }))}
        />
        <span role="status" className={`text-xs ${saveState === "error" ? "font-medium text-red-600" : "text-gray-500"}`} title={saveError ?? undefined}>
          {saveLabel}{saveState === "error" && saveError ? `: ${saveError}` : ""}
        </span>

        <nav aria-label="Builder sections" className="mx-auto flex rounded-lg bg-gray-100 p-0.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t.id ? "bg-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!hist.past} onClick={undo} className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!hist.future} onClick={redo} className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </div>
        <span className="text-xs text-gray-500">
          {publishedVersion ? `Live: v${publishedVersion}${unpublished ? " · changes not published" : ""}` : "Not published yet"}
        </span>
        <button
          type="button"
          onClick={publish}
          disabled={publishing || issues.count > 0}
          title={issues.count ? `Fix ${issues.count} problem${issues.count === 1 ? "" : "s"} first` : "Make these changes live"}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </header>

      {(publishMsg || issues.count > 0) && (
        <div className={`border-b px-4 py-2 text-sm ${publishMsg?.ok ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="status">
          {publishMsg ? (
            <>
              {publishMsg.ok ? "✓ " : ""}{publishMsg.text}
              {publishMsg.ok && <> Live at <a className="underline" href={`/f/${slug}`} target="_blank" rel="noreferrer">/f/{slug}</a>. Visitors already part-way through finish on the version they started.</>}
              {publishMsg.errors && <ul className="mt-1 list-disc pl-5 text-xs">{publishMsg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </>
          ) : (
            <>
              {issues.count} problem{issues.count === 1 ? "" : "s"} to fix before publishing (marked in red).
              {issues.general.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{issues.general.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </>
          )}
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1">
        {tab === "build" && (
          <div className="grid h-full grid-cols-1 lg:grid-cols-[270px_1fr_380px]">
            <aside className="min-h-0 border-r border-gray-200 bg-white">
              <Outline
                funnel={funnel}
                sel={sel}
                onSelect={setSel}
                onMove={(from, to) => update((f) => moveQuestion(f, from, to))}
                onAdd={() => setPaletteOpen(true)}
                onAddEnding={() => {
                  const next = addEndScreen(funnel);
                  update(() => next);
                  setSel({ kind: "end", key: next.endScreens[next.endScreens.length - 1].key });
                }}
                issues={issues}
              />
            </aside>

            <section className="hidden min-h-0 flex-col lg:flex" aria-label="Preview">
              <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-1.5">
                <p className="text-xs text-gray-500">Live preview of this step. Nothing you enter here is saved.</p>
                <DeviceToggle device={device} setDevice={setDevice} onRestart={() => setPreviewNonce((n) => n + 1)} />
              </div>
              <div className="min-h-0 flex-1">
                <PreviewFrame funnel={funnel} startAt={previewStart} device={device} nonce={previewNonce} />
              </div>
            </section>

            <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-4" aria-label="Settings for the selected step">
              {selectedQuestion && (
                <QuestionProperties
                  key={selectedQuestion.key}
                  q={selectedQuestion}
                  formId={formId}
                  issues={issues.byQuestion[selectedQuestion.key] ?? []}
                  onPatch={(patch) => update((f) => updateQuestion(f, selectedQuestion.key, patch))}
                  onOptions={(options, renamed) =>
                    update((f) => {
                      const g = renamed ? renameOptionValue(f, selectedQuestion.key, renamed.from, renamed.to) : f;
                      return updateQuestion(g, selectedQuestion.key, { options } as Partial<Question>);
                    })
                  }
                  onRenameKey={(to) => {
                    const next = renameQuestionKey(funnel, selectedQuestion.key, to);
                    if (!next) return "That ID is invalid or already used.";
                    update(() => next);
                    setSel({ kind: "question", key: to });
                    return null;
                  }}
                  onDuplicate={() => {
                    const next = duplicateQuestion(funnel, selectedQuestion.key);
                    update(() => next);
                    const i = next.questions.findIndex((q) => q.key === selectedQuestion.key);
                    setSel({ kind: "question", key: next.questions[i + 1].key });
                  }}
                  onDelete={() => {
                    const usedInLogic = funnel.logic.some((r) => r.after === selectedQuestion.key || (r.action.type === "jump" && r.action.to === selectedQuestion.key) || r.conditions.some((c) => c.source.kind === "question" && c.source.key === selectedQuestion.key));
                    if (usedInLogic && !window.confirm("This question is used in logic rules. Delete it and those rules?")) return;
                    update((f) => removeQuestion(f, selectedQuestion.key));
                  }}
                />
              )}
              {sel.kind === "welcome" && (
                <WelcomeProperties welcome={funnel.welcome} formId={formId} onChange={(welcome) => update((f) => ({ ...f, welcome }))} />
              )}
              {selectedEnd && (
                <EndProperties
                  key={selectedEnd.key}
                  end={selectedEnd}
                  formId={formId}
                  issues={issues.byEnd[selectedEnd.key] ?? []}
                  canDelete={funnel.endScreens.length > 1}
                  onChange={(patch) => update((f) => updateEndScreen(f, selectedEnd.key, patch))}
                  onDelete={() => update((f) => removeEndScreen(f, selectedEnd.key))}
                />
              )}
            </aside>
          </div>
        )}

        {tab === "logic" && (
          <div className="h-full overflow-y-auto">
            <LogicEditor funnel={funnel} issues={issues} update={update} />
          </div>
        )}

        {tab === "design" && (
          <div className="grid h-full grid-cols-1 lg:grid-cols-[380px_1fr]">
            <aside className="min-h-0 overflow-y-auto border-r border-gray-200 bg-white">
              <DesignPanel funnel={funnel} formId={formId} update={update} />
            </aside>
            <section className="hidden min-h-0 flex-col lg:flex">
              <div className="flex justify-end border-b border-gray-200 bg-white px-3 py-1.5">
                <DeviceToggle device={device} setDevice={setDevice} onRestart={() => setPreviewNonce((n) => n + 1)} />
              </div>
              <div className="min-h-0 flex-1"><PreviewFrame funnel={funnel} startAt={previewStart} device={device} nonce={previewNonce} /></div>
            </section>
          </div>
        )}

        {tab === "preview" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-1.5">
              <p className="text-xs text-gray-500">Try the whole form from the start, including logic. Nothing is saved.</p>
              <DeviceToggle device={device} setDevice={setDevice} onRestart={() => setPreviewNonce((n) => n + 1)} />
            </div>
            <div className="min-h-0 flex-1"><PreviewFrame funnel={funnel} startAt={null} device={device} nonce={previewNonce} /></div>
          </div>
        )}
      </div>

      {paletteOpen && <Palette onPick={addBlock} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function DeviceToggle({ device, setDevice, onRestart }: { device: "mobile" | "desktop"; setDevice: (d: "mobile" | "desktop") => void; onRestart: () => void }) {
  const b = (active: boolean) => `rounded p-1.5 ${active ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`;
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Mobile preview" aria-pressed={device === "mobile"} className={b(device === "mobile")} onClick={() => setDevice("mobile")}><Smartphone className="h-4 w-4" /></button>
      <button type="button" aria-label="Desktop preview" aria-pressed={device === "desktop"} className={b(device === "desktop")} onClick={() => setDevice("desktop")}><Monitor className="h-4 w-4" /></button>
      <button type="button" aria-label="Restart preview" title="Restart preview" className={b(false)} onClick={onRestart}><RotateCcw className="h-4 w-4" /></button>
    </div>
  );
}
