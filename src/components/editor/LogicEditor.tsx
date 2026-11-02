"use client";

import { ArrowDown, ArrowUp, GitBranch, Plus, Trash2, X } from "lucide-react";
import { defaultEndKey, isNavigable } from "@/lib/funnel/engine";
import { newRuleId, type EditorIssues } from "@/lib/funnel/editing";
import { screens } from "@/lib/funnel/engine";
import type { Condition, Funnel, LogicRule, Operator, Question } from "@/lib/funnel/schema";
import { inputCls, smallBtn } from "./fields";

type Update = (fn: (f: Funnel) => Funnel) => void;

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "any_of", label: "is any of" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "is more than" },
  { value: "less_than", label: "is less than" },
  { value: "is_answered", label: "is answered" },
  { value: "is_empty", label: "is empty" },
];
const NO_VALUE: Operator[] = ["is_answered", "is_empty"];

const answerable = (q: Question) => q.type !== "statement";
const optionsOf = (q?: Question) => (q && "options" in q ? q.options : null);

/** "If [answer] [is] [value] then [go to / end]". Rules run top to bottom; the first match wins. */
export function LogicEditor({ funnel, issues, update }: { funnel: Funnel; issues: EditorIssues; update: Update }) {
  // One entry per screen: its last question is where a rule is checked, and the next screen's first question is the jump target.
  const screenList = screens(funnel);
  const ends = screenList.map((s) => funnel.questions.find((x) => x.key === s[s.length - 1])!).filter(Boolean);
  const heads = screenList.map((s) => s[0]);

  const setRules = (fn: (rules: LogicRule[]) => LogicRule[]) => update((f) => ({ ...f, logic: fn(f.logic) }));
  const patchRule = (id: string, patch: Partial<LogicRule>) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRule = (q: Question, index: number) => {
    const opts = optionsOf(q);
    const nextKey = heads[index + 1];
    const rule: LogicRule = {
      id: newRuleId(),
      after: q.key,
      combinator: "and",
      conditions: [{ source: { kind: "question", key: q.key }, operator: opts ? "equals" : "is_answered", value: opts?.[0]?.value }],
      action: nextKey ? { type: "jump", to: nextKey } : { type: "end", screen: defaultEndKey(funnel) },
    };
    setRules((rs) => [...rs, rule]);
  };

  const moveRule = (id: string, dir: -1 | 1) =>
    setRules((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const peers = rs.map((r, k) => ({ r, k })).filter(({ r }) => r.after === rs[i].after);
      const pos = peers.findIndex((p) => p.k === i);
      const swap = peers[pos + dir];
      if (!swap) return rs;
      const out = [...rs];
      [out[i], out[swap.k]] = [out[swap.k], out[i]];
      return out;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="h-5 w-5 text-indigo-600" aria-hidden /> Logic</h2>
        <p className="text-sm text-gray-500">After each question, send people somewhere based on their answers (or on link parameters like utm_source). Rules are checked top to bottom; the first one that matches wins. If none match, they go to the next question.</p>
      </div>

      {ends.map((q, i) => {
        const rules = funnel.logic.filter((r) => r.after === q.key);
        const nextKey = heads[i + 1];
        const next = nextKey ? funnel.questions.find((x) => x.key === nextKey) : undefined;
        return (
          <section key={q.key} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900"><span className="text-gray-400">{i + 1}.</span> {q.label || "Untitled"}</p>
            <div className="mt-3 space-y-3">
              {rules.map((r, ri) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  funnel={funnel}
                  heads={heads}
                  errors={issues.byRule[r.id] ?? []}
                  first={ri === 0}
                  last={ri === rules.length - 1}
                  onPatch={(p) => patchRule(r.id, p)}
                  onDelete={() => setRules((rs) => rs.filter((x) => x.id !== r.id))}
                  onMove={(d) => moveRule(r.id, d)}
                />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className={smallBtn} onClick={() => addRule(q, i)}><Plus className="h-3.5 w-3.5" /> Add rule</button>
                <p className="text-xs text-gray-500">{rules.length ? "Otherwise" : "Always"} → {next ? `next question: ${next.label || next.key}` : `ending: ${funnel.endScreens.find((e) => e.key === defaultEndKey(funnel))?.title}`}</p>
              </div>
            </div>
          </section>
        );
      })}
      {ends.length === 0 && <p className="text-sm text-gray-500">Add some questions first.</p>}
    </div>
  );
}

function RuleCard(props: {
  rule: LogicRule;
  funnel: Funnel;
  /** First question of each screen: the only valid jump targets. */
  heads: string[];
  errors: string[];
  first: boolean;
  last: boolean;
  onPatch: (p: Partial<LogicRule>) => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const { rule, funnel, errors, onPatch, heads } = props;
  const setCondition = (i: number, c: Condition) => onPatch({ conditions: rule.conditions.map((x, k) => (k === i ? c : x)) });

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="space-y-2">
        {rule.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-xs font-semibold uppercase text-indigo-700">
              {i === 0 ? "If" : (
                <select aria-label="Combine conditions" className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs" value={rule.combinator} onChange={(e) => onPatch({ combinator: e.target.value as "and" | "or" })}>
                  <option value="and">and</option>
                  <option value="or">or</option>
                </select>
              )}
            </span>
            <ConditionRow c={c} funnel={funnel} onChange={(nc) => setCondition(i, nc)} />
            {rule.conditions.length > 1 && (
              <button type="button" aria-label="Remove condition" className="p-1 text-gray-500 hover:text-red-700" onClick={() => onPatch({ conditions: rule.conditions.filter((_, k) => k !== i) })}><X className="h-4 w-4" /></button>
            )}
          </div>
        ))}
        <button type="button" className="ml-14 text-xs font-medium text-indigo-600 hover:underline" onClick={() => onPatch({ conditions: [...rule.conditions, { source: { kind: "question", key: rule.after }, operator: "is_answered" }] })}>+ add condition</button>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="w-12 text-xs font-semibold uppercase text-indigo-700">Then</span>
          <select
            aria-label="Action"
            className={`${inputCls} w-auto`}
            value={rule.action.type}
            onChange={(e) =>
              onPatch({
                action: e.target.value === "end"
                  ? { type: "end", screen: defaultEndKey(funnel) }
                  : { type: "jump", to: funnel.questions.find(isNavigable)?.key ?? rule.after },
              })
            }
          >
            <option value="jump">go to question</option>
            <option value="end">end with</option>
          </select>
          {rule.action.type === "jump" ? (
            <select aria-label="Go to question" className={`${inputCls} w-auto max-w-xs`} value={rule.action.to} onChange={(e) => onPatch({ action: { type: "jump", to: e.target.value } })}>
              {heads.map((key, n) => { const q = funnel.questions.find((x) => x.key === key); return <option key={key} value={key}>{n + 1}. {q?.label || key}</option>; })}
            </select>
          ) : (
            <select aria-label="Ending" className={`${inputCls} w-auto max-w-xs`} value={rule.action.screen} onChange={(e) => onPatch({ action: { type: "end", screen: e.target.value } })}>
              {funnel.endScreens.map((e) => <option key={e.key} value={e.key}>{e.title || e.key}</option>)}
            </select>
          )}
        </div>
      </div>

      {errors.length > 0 && <ul role="alert" className="mt-2 text-xs text-red-700">{errors.map((m, i) => <li key={i}>• {m}</li>)}</ul>}

      <div className="mt-2 flex justify-end gap-1">
        <button type="button" aria-label="Move rule up" className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" disabled={props.first} onClick={() => props.onMove(-1)}><ArrowUp className="h-4 w-4" /></button>
        <button type="button" aria-label="Move rule down" className="p-1 text-gray-500 hover:text-gray-900 disabled:opacity-30" disabled={props.last} onClick={() => props.onMove(1)}><ArrowDown className="h-4 w-4" /></button>
        <button type="button" aria-label="Delete rule" className="p-1 text-gray-500 hover:text-red-700" onClick={props.onDelete}><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function ConditionRow({ c, funnel, onChange }: { c: Condition; funnel: Funnel; onChange: (c: Condition) => void }) {
  const q = c.source.kind === "question" ? funnel.questions.find((x) => x.key === (c.source as { key: string }).key) : undefined;
  const opts = optionsOf(q);
  const boolQ = q?.type === "yes_no" || q?.type === "consent";
  const numQ = q?.type === "number" || q?.type === "rating";
  const sourceValue = c.source.kind === "question" ? `q:${c.source.key}` : "param";

  return (
    <>
      <select
        aria-label="Answer to check"
        className={`${inputCls} w-auto max-w-[14rem]`}
        value={sourceValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "param" ? { source: { kind: "param", name: "utm_source" }, operator: "equals", value: "" } : { source: { kind: "question", key: v.slice(2) }, operator: "is_answered" });
        }}
      >
        {funnel.questions.filter(answerable).map((x) => <option key={x.key} value={`q:${x.key}`}>{x.label || x.key}</option>)}
        <option value="param">Link parameter (e.g. utm_source)</option>
      </select>
      {c.source.kind === "param" && (
        <input aria-label="Parameter name" className={`${inputCls} w-32 font-mono`} value={c.source.name} onChange={(e) => onChange({ ...c, source: { kind: "param", name: e.target.value.trim() } })} />
      )}
      <select aria-label="Comparison" className={`${inputCls} w-auto`} value={c.operator} onChange={(e) => {
        const operator = e.target.value as Operator;
        onChange({ ...c, operator, value: NO_VALUE.includes(operator) ? undefined : operator === "any_of" ? [] : opts?.[0]?.value ?? (boolQ ? true : "") });
      }}>
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {!NO_VALUE.includes(c.operator) && (
        c.operator === "any_of" && opts ? (
          <span className="flex flex-wrap gap-2">
            {opts.map((o) => {
              const list = Array.isArray(c.value) ? c.value : [];
              const on = list.includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs">
                  <input type="checkbox" checked={on} onChange={() => onChange({ ...c, value: on ? list.filter((v) => v !== o.value) : [...list, o.value] })} />
                  {o.label}
                </label>
              );
            })}
          </span>
        ) : opts ? (
          <select aria-label="Value" className={`${inputCls} w-auto max-w-[12rem]`} value={String(c.value ?? "")} onChange={(e) => onChange({ ...c, value: e.target.value })}>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : boolQ ? (
          <select aria-label="Value" className={`${inputCls} w-auto`} value={String(c.value === true)} onChange={(e) => onChange({ ...c, value: e.target.value === "true" })}>
            <option value="true">{q?.type === "consent" ? "ticked" : "Yes"}</option>
            <option value="false">{q?.type === "consent" ? "not ticked" : "No"}</option>
          </select>
        ) : (
          <input
            aria-label="Value"
            type={numQ ? "number" : "text"}
            className={`${inputCls} w-36`}
            value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}
            onChange={(e) => onChange({ ...c, value: c.operator === "any_of" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : numQ ? Number(e.target.value) : e.target.value })}
          />
        )
      )}
    </>
  );
}
