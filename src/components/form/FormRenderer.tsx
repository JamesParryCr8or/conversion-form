"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  computePath, firstStep, isNavigable, nextStep, validateAnswer,
  type Answers, type AnswerValue, type Params,
} from "@/lib/funnel/engine";
import type { Funnel } from "@/lib/funnel/schema";
import { toE164Guess } from "@/lib/phone";
import { Media } from "./Media";
import { QuestionInput, autoAdvances } from "./QuestionInput";

type Phase = "loading" | "welcome" | "question" | "end" | "error";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FOCUS_HEADING = new Set(["single_choice", "multiple_choice", "yes_no", "rating", "statement", "consent"]);

const getCookie = (name: string) =>
  document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1] ?? null;

const hasValue = (v: unknown) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));

type Props = {
  slug: string;
  funnel: Funnel;
  /** Builder preview: nothing is saved, no URL changes, no redirects, no messages to a parent page. */
  preview?: boolean;
  /** Preview only: open directly on this question (or "welcome", or an end-screen key). */
  startAt?: string | null;
};

/** Where a builder preview opens: a given question, an ending, the welcome screen, or the first question. */
function previewInitial(funnel: Funnel, startAt: string | null): { phase: Phase; currentKey: string | null; endKey: string | null } {
  const end = funnel.endScreens.find((e) => e.key === startAt);
  if (end) return { phase: "end", currentKey: null, endKey: end.key };
  const q = funnel.questions.find((x) => x.key === startAt && x.type !== "hidden");
  if (q) return { phase: "question", currentKey: q.key, endKey: null };
  if (funnel.welcome && (startAt === "welcome" || !startAt)) return { phase: "welcome", currentKey: null, endKey: null };
  const first = firstStep(funnel);
  return first.kind === "question" ? { phase: "question", currentKey: first.key, endKey: null } : { phase: "end", currentKey: null, endKey: first.key };
}

export function FormRenderer({ slug, funnel, preview = false, startAt = null }: Props) {
  // A preview starts in place (it is remounted whenever the builder selects a different step).
  const [initial] = useState(() => (preview ? previewInitial(funnel, startAt) : null));
  const [phase, setPhase] = useState<Phase>(initial?.phase ?? "loading");
  const [answers, setAnswers] = useState<Answers>({});
  const [params, setParams] = useState<Params>({});
  const [currentKey, setCurrentKey] = useState<string | null>(initial?.currentKey ?? null);
  const [endKey, setEndKey] = useState<string | null>(initial?.endKey ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [embedded, setEmbedded] = useState(false);

  const sidRef = useRef<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]); // questions already passed, for Back + progress
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const startedSent = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const labelId = useId();

  const theme = funnel.form.theme;
  const navigableCount = funnel.questions.filter(isNavigable).length;
  const question = funnel.questions.find((q) => q.key === currentKey) ?? null;

  /* ---------- parent page messaging + URL ---------- */

  const tell = (type: string, data: Record<string, unknown> = {}) => {
    if (preview) return;
    if (window.parent !== window) {
      window.parent.postMessage({ source: "cr8or-form", type, slug, sid: sidRef.current, ...data }, "*");
    }
  };

  const syncUrl = (key: string | null) => {
    if (preview) return;
    const url = new URL(window.location.href);
    if (sidRef.current) url.searchParams.set("sid", sidRef.current);
    if (key) url.searchParams.set("q", key);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };

  /* ---------- boot: resume or start ---------- */

  useEffect(() => {
    let cancelled = false;
    if (preview) return; // builder preview never touches the API
    (async () => {
      const url = new URL(window.location.href);
      const incoming: Params = {};
      url.searchParams.forEach((v, k) => {
        if (k !== "sid" && k !== "q") incoming[k] = v;
      });
      const wantSid = url.searchParams.get("sid");
      const wantQ = url.searchParams.get("q");
      setEmbedded(window.parent !== window);

      try {
        let sid = wantSid;
        let saved: { status: string; currentQuestionKey: string | null; endScreenKey: string | null; params: Params | null; answers: Answers } | null = null;

        if (sid) {
          const r = await fetch(`/api/submissions/${encodeURIComponent(sid)}`);
          if (r.ok) saved = await r.json();
          else sid = null; // unknown or expired link: start fresh
        }
        if (!sid) {
          const r = await fetch(`/api/f/${encodeURIComponent(slug)}/submissions`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ params: incoming, fbp: getCookie("_fbp"), fbc: getCookie("_fbc") }),
          });
          if (!r.ok) throw new Error("start failed");
          sid = (await r.json()).sid as string;
        }
        if (cancelled) return;
        sidRef.current = sid;

        const p = saved?.params ?? incoming;
        const a = saved?.answers ?? {};
        setParams(p);
        setAnswers(a);

        if (saved?.status === "completed") {
          setEndKey(saved.endScreenKey ?? (funnel.endScreens.find((e) => e.isDefault) ?? funnel.endScreens[0]).key);
          setPhase("end");
          syncUrl(null);
          tell("form:loaded", { resumed: true, completed: true });
          return;
        }

        const { path } = computePath(funnel, a, p);
        const answered = Object.keys(a).length > 0;
        let target: string | null = null;
        if (wantQ && path.includes(wantQ)) target = wantQ;
        else if (answered) target = saved?.currentQuestionKey && path.includes(saved.currentQuestionKey) ? saved.currentQuestionKey : path[path.length - 1];

        if (target) {
          setTrail(path.slice(0, path.indexOf(target)));
          setCurrentKey(target);
          setPhase("question");
        } else if (funnel.welcome) {
          setPhase("welcome");
        } else {
          const first = firstStep(funnel);
          setCurrentKey(first.kind === "question" ? first.key : null);
          setPhase("question");
        }
        syncUrl(target);
        tell("form:loaded", { resumed: Boolean(saved) });
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  /* ---------- iframe: report height to the parent page ---------- */

  useEffect(() => {
    if (!embedded || !rootRef.current) return;
    const el = rootRef.current;
    const send = () => tell("form:resize", { height: Math.ceil(el.getBoundingClientRect().height) });
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  /* ---------- keep keyboard / screen-reader focus sensible ---------- */

  useEffect(() => {
    if (preview) return; // in the builder, never pull focus away from the settings being edited
    if (phase === "question" && question && FOCUS_HEADING.has(question.type)) headingRef.current?.focus();
    if (phase === "end" || phase === "welcome") headingRef.current?.focus();
  }, [phase, currentKey, question, preview]);

  /* ---------- end-screen redirect ---------- */

  const endScreen = funnel.endScreens.find((e) => e.key === endKey) ?? null;
  useEffect(() => {
    const target = endScreen?.redirectUrl;
    if (preview) return; // never navigate away from the builder
    if (phase !== "end" || !target || !/^https?:\/\//i.test(target)) return;
    const t = window.setTimeout(() => {
      if (window.parent !== window) tell("form:redirect", { url: target });
      else window.location.assign(target);
    }, (endScreen?.redirectDelaySeconds ?? 0) * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, endScreen]);

  /* ---------- actions ---------- */

  const go = (key: string) => {
    if (currentKey) setTrail((t) => [...t, currentKey]);
    setCurrentKey(key);
    setError(null);
    syncUrl(key);
    tell("form:step", { question: key });
  };

  const goBack = () => {
    const prev = trail[trail.length - 1];
    if (!prev) {
      if (funnel.welcome) {
        setPhase("welcome");
        syncUrl(null);
      }
      return;
    }
    setTrail((t) => t.slice(0, -1));
    setCurrentKey(prev);
    setError(null);
    syncUrl(prev);
  };

  const saveInBackground = (key: string, value: AnswerValue) => {
    if (preview) return;
    saveQueue.current = saveQueue.current.then(() =>
      fetch(`/api/submissions/${sidRef.current}/answers`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ questionKey: key, value }),
        keepalive: true,
      }).catch(() => undefined), // failures are repaired when the form completes (all answers are resent)
    );
  };

  const finish = async (finalAnswers: Answers) => {
    if (preview) {
      const path = computePath(funnel, finalAnswers, params);
      setEndKey(path.endKey ?? (funnel.endScreens.find((e) => e.isDefault) ?? funnel.endScreens[0]).key);
      setPhase("end");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveQueue.current;
      const r = await fetch(`/api/submissions/${sidRef.current}/complete`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ answers: Object.fromEntries(Object.entries(finalAnswers).filter(([, v]) => hasValue(v))) }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (body.key && funnel.questions.some((q) => q.key === body.key)) {
          setCurrentKey(body.key);
          syncUrl(body.key);
        }
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setEndKey(body.endKey);
      setPhase("end");
      syncUrl(null);
      tell("form:completed", { end: body.endKey });
    } catch {
      setError("We couldn't send your answers. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (override?: AnswerValue) => {
    if (!question || busy) return;
    let value: AnswerValue | undefined = override !== undefined ? override : answers[question.key];
    if (typeof value === "string") {
      value = question.type === "phone" ? toE164Guess(value, question.defaultCountry) : value.trim();
    }
    const problem = validateAnswer(question, value);
    if (problem) {
      setError(problem);
      return;
    }

    const next: Answers = question.type === "statement" ? answers : { ...answers, [question.key]: value };
    setAnswers(next);
    setError(null);
    if (question.type !== "statement" && hasValue(value)) {
      saveInBackground(question.key, value as AnswerValue);
      if (!startedSent.current) {
        startedSent.current = true;
        tell("form:started");
      }
    }

    const step = nextStep(funnel, question.key, next, params);
    if (step.kind === "end") void finish(next);
    else go(step.key);
  };

  /* ---------- render ---------- */

  const style = {
    "--primary": theme.primaryColor,
    "--radius": theme.buttonStyle === "pill" ? "9999px" : theme.buttonStyle === "square" ? "4px" : "14px",
    background: theme.backgroundImageUrl ? `url(${theme.backgroundImageUrl}) center/cover` : theme.backgroundColor,
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
    fontFamily: `${theme.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif`,
  } as React.CSSProperties;

  const primaryBtn =
    "w-full rounded-[var(--radius)] bg-[var(--primary)] px-6 py-4 text-lg font-semibold text-white transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

  const progress = funnel.form.settings.showProgressBar && phase === "question" ? Math.min(100, Math.round((trail.length / navigableCount) * 100)) : null;

  return (
    <div ref={rootRef} style={style} className={`flex w-full flex-col items-center px-4 py-8 ${embedded || preview ? "" : "min-h-dvh justify-center"}`}>
      <div className="w-full max-w-xl">
        {theme.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logoUrl} alt="" className="mx-auto mb-6 h-10 object-contain" />
        )}

        {progress !== null && (
          <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress" className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-[var(--primary)] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}

        {phase === "loading" && <p className="py-16 text-center opacity-60" role="status">Loading…</p>}

        {phase === "error" && (
          <div className="py-16 text-center" role="alert">
            <p className="text-xl font-semibold">We couldn&apos;t load this form</p>
            <p className="mt-2 opacity-70">Please refresh the page and try again.</p>
          </div>
        )}

        {phase === "welcome" && funnel.welcome && (
          <section className="text-center">
            <Media media={funnel.welcome.media} className="mx-auto mb-6 max-h-56 w-full" />
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none sm:text-4xl">{funnel.welcome.title}</h1>
            {funnel.welcome.body && <p className="mt-4 text-lg opacity-75">{funnel.welcome.body}</p>}
            <button type="button" className={`${primaryBtn} mt-8`} onClick={() => {
              const first = firstStep(funnel);
              if (first.kind === "question") { setCurrentKey(first.key); setPhase("question"); syncUrl(first.key); }
            }}>{funnel.welcome.buttonText}</button>
          </section>
        )}

        {phase === "question" && question && (
          <form key={question.key} onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <Media media={question.media} className="mb-6 max-h-56 w-full" />
            <h1 id={labelId} ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl">{question.label}</h1>
            {question.type !== "statement" && question.description && <p className="mt-2 opacity-70">{question.description}</p>}
            {question.type === "statement" && question.description && <p className="mt-3 text-lg opacity-75">{question.description}</p>}

            <div className="mt-6">
              <QuestionInput
                q={question}
                value={answers[question.key]}
                onChange={(v) => { setAnswers((a) => ({ ...a, [question.key]: v })); setError(null); }}
                onSubmit={(v) => submit(v)}
                labelId={labelId}
                invalid={error !== null}
                noAutoFocus={preview}
              />
            </div>

            <p role="alert" aria-live="polite" className="mt-3 min-h-6 text-sm font-medium text-red-600">{error}</p>

            <div className="mt-4 flex items-center gap-3">
              {(trail.length > 0 || funnel.welcome) && (
                <button type="button" onClick={goBack} className="rounded-[var(--radius)] border-2 border-black/15 px-5 py-4 text-lg" aria-label="Go back">←</button>
              )}
              {!autoAdvances(question) && (
                <button type="submit" disabled={busy} className={primaryBtn}>
                  {busy ? "Sending…" : question.type === "statement" ? question.buttonText : "Continue"}
                </button>
              )}
            </div>
            {busy && autoAdvances(question) && <p className="mt-3 text-center opacity-60" role="status">Sending…</p>}
          </form>
        )}

        {phase === "end" && endScreen && (
          <section className="py-8 text-center" role="status">
            <Media media={endScreen.media} className="mx-auto mb-6 max-h-56 w-full" />
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none">{endScreen.title}</h1>
            {endScreen.body && <p className="mt-4 text-lg opacity-75">{endScreen.body}</p>}
            {preview && endScreen.redirectUrl && <p className="mt-4 text-sm opacity-60">(Live form redirects to {endScreen.redirectUrl})</p>}
            {preview && <button type="button" className="mt-6 text-sm underline opacity-70" onClick={() => { setAnswers({}); setTrail([]); setEndKey(null); if (funnel.welcome) setPhase("welcome"); else { const f = firstStep(funnel); if (f.kind === "question") { setCurrentKey(f.key); setPhase("question"); } } }}>Restart preview</button>}
          </section>
        )}
      </div>
    </div>
  );
}
