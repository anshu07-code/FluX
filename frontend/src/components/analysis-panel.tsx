"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import {
  X, CheckCircle2, AlertCircle, Loader2, Clock, Gauge,
  Database, Zap, ChevronDown, Activity,
} from "lucide-react";
import type { PersistedExecution, PersistedNodeExecution } from "@/lib/workflow-api";

/* ── helpers ───────────────────────────────────────────────────────────── */

type Ne = PersistedNodeExecution;

function ms(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return new Date(b).getTime() - new Date(a).getTime();
}

function fmt(msVal: number): string {
  if (msVal <= 0) return "—";
  if (msVal < 1000) return `${Math.round(msVal)}ms`;
  return `${(msVal / 1000).toFixed(2)}s`;
}

function jsonSize(v: unknown): number {
  if (v == null) return 0;
  try { return new Blob([typeof v === "string" ? v : JSON.stringify(v)]).size; } catch { return 0; }
}

function pretty(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  if (!s || s === "{}" || s === "null") return null;
  return s;
}

/**
 * Detects a node that executed against a placeholder instead of doing the real
 * thing. Service nodes tag such output with `mock: true` (http, webhook, ai,
 * document, email) or `sent: false` (slack) so this is reliable across types.
 * The flag sits at the top level for http/webhook/ai but is nested under an
 * `output` field for slack/document/email, so both shapes are checked.
 * Returns the human-readable reason, or null when the node ran for real.
 */
function mockNote(n: Ne): string | null {
  const out = n.output;
  if (!out || typeof out !== "object" || Array.isArray(out)) return null;

  const pick = (o: Record<string, unknown>): string | null => {
    if (o.mock === true || o.sent === false) {
      return typeof o.note === "string"
        ? o.note
        : "This node ran in mock mode — no real request was made.";
    }
    return null;
  };

  const top = pick(out as Record<string, unknown>);
  if (top) return top;

  const nested = (out as Record<string, unknown>).output;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return pick(nested as Record<string, unknown>);
  }
  return null;
}

const STATUS_META: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  SUCCESS:  { color: "#34d399", icon: CheckCircle2 },
  FAILED:   { color: "#f87171", icon: AlertCircle },
  RUNNING:  { color: "#fbbf24", icon: Loader2 },
  WAITING:  { color: "#7dd3fc", icon: Clock },
  PENDING:  { color: "#94a3b8", icon: Clock },
  SKIPPED:  { color: "#64748b", icon: ChevronDown },
  CANCELLED:{ color: "#64748b", icon: X },
};

/* ── component ─────────────────────────────────────────────────────────── */

export function AnalysisPanel({
  execution,
  onClose,
}: {
  execution: PersistedExecution;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "path">("overview");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const nodes = execution.nodeExecutions;
  const total = nodes.length;

  const done = useMemo(
    () => nodes.filter((n) => n.status === "SUCCESS" || n.status === "FAILED").length,
    [nodes]
  );
  const failed = nodes.filter((n) => n.status === "FAILED").length;
  const mocked = useMemo(() => nodes.filter((n) => mockNote(n) !== null).length, [nodes]);
  const live = execution.status === "RUNNING" || execution.status === "PENDING";

  const durations = nodes.map((n) => ms(n.startedAt, n.completedAt));
  const totalMs = ms(execution.startedAt, execution.completedAt) || durations.reduce((a, b) => a + b, 0);
  const slowest = Math.max(...durations, 0);
  const inBytes = nodes.reduce((a, n) => a + jsonSize(n.input), 0);
  const outBytes = nodes.reduce((a, n) => a + jsonSize(n.output), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const wallMs = ms(execution.startedAt, execution.completedAt) || (live ? ms(execution.startedAt, new Date().toISOString()) : 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <motion.div
      initial={{ y: 48, opacity: 0, scale: 0.98 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 48, opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-[660px] max-w-[calc(100vw-24px)] max-h-[82vh] min-h-[480px] rounded-2xl border backdrop-blur-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
      style={{ backgroundColor: "rgba(9, 11, 18, 0.96)", borderColor: "rgba(255,255,255,0.1)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,58,237,0.16)", border: "1px solid rgba(124,58,237,0.35)" }}>
            <Activity className="w-4 h-4 text-flux-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Execution analysis
              {live && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-amber-300 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> LIVE
                </span>
              )}
            </h3>
            <p className="text-[10.5px] font-mono text-slate-500">{execution.id.slice(0, 16)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-slate-400">{fmt(wallMs)}</span>
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{
              color: STATUS_META[execution.status]?.color ?? "#94a3b8",
              background: `${STATUS_META[execution.status]?.color ?? "#94a3b8"}1f`,
              border: `1px solid ${STATUS_META[execution.status]?.color ?? "#94a3b8"}40`,
            }}
          >
            {execution.status}
          </span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex items-center gap-1 px-5 pt-2.5 shrink-0">
        {([
          { id: "overview", label: "Overview", count: null },
          { id: "path", label: "Path", count: total },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
            style={{
              color: tab === t.id ? "#ffffff" : "#64748b",
              background: tab === t.id ? "rgba(124,58,237,0.18)" : "transparent",
              border: tab === t.id ? "1px solid rgba(124,58,237,0.4)" : "1px solid transparent",
            }}
          >
            {t.label}
            {t.count !== null && (
              <span
                className="text-[9px] font-mono px-1.5 rounded-full"
                style={{
                  color: tab === t.id ? "#c4b5fd" : "#64748b",
                  background: tab === t.id ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.05)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "overview" ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex-1 min-h-[300px] overflow-y-auto"
          >
      {/* ── Progress bar ── */}
      <div className="px-5 pt-3.5 pb-1 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10.5px] font-medium text-slate-400">
            {done} of {total} nodes complete{failed ? ` · ${failed} failed` : ""}
          </span>
          <span className="text-[10.5px] font-mono text-flux-300">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: failed ? "linear-gradient(90deg,#f87171,#ef4444)" : "linear-gradient(90deg,#8b5cf6,#6366f1)" }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {/* ── Stat strip ── */}
      <div className="grid grid-cols-4 gap-2 px-5 py-3 shrink-0">
        {[
          { icon: Gauge, label: "Total", value: fmt(totalMs), color: "#a78bfa" },
          { icon: Zap, label: "Slowest node", value: fmt(slowest), color: "#fbbf24" },
          { icon: Database, label: "Data in", value: inBytes >= 1024 ? `${(inBytes / 1024).toFixed(1)}KB` : `${inBytes}B`, color: "#38bdf8" },
          { icon: Activity, label: "Data out", value: outBytes >= 1024 ? `${(outBytes / 1024).toFixed(1)}KB` : `${outBytes}B`, color: "#34d399" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <s.icon className="w-3 h-3 mb-1" style={{ color: s.color }} />
            <p className="text-[13px] font-semibold text-white font-mono leading-none">{s.value}</p>
            <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {mocked > 0 && (
        <div className="mx-5 mb-3 px-3 py-2.5 rounded-lg shrink-0" style={{ background: "rgba(251,191,36,0.09)", border: "1px solid rgba(251,191,36,0.3)" }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="text-[11px] font-semibold text-amber-300">
              {mocked} of {total} node{mocked === 1 ? "" : "s"} ran in mock mode
            </p>
          </div>
          <p className="text-[10px] text-amber-200/70 mt-1 leading-relaxed">
            These nodes did not perform their real action — the connected service is not configured.
            In production an unconfigured node fails the run instead, so this only happens in development.
            Open the Path tab and look for the MOCK badge to see which node and what to fill in.
          </p>
        </div>
      )}

      {execution.error && (
        <div className="mx-5 mb-3 px-3 py-2.5 rounded-lg shrink-0" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] font-semibold text-red-300">Run failed</p>
          </div>
          <p className="text-[11px] text-red-300/80 font-mono leading-relaxed break-all">{execution.error}</p>
        </div>
      )}

      {/* ── Waterfall timeline ── */}
      {total > 0 && slowest > 0 && (
        <div className="px-5 pb-2 shrink-0">
          <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2">Timeline</p>
          <div className="space-y-1">
            {nodes.map((n, i) => {
              const d = durations[i];
              const w = Math.max((d / slowest) * 100, d > 0 ? 3 : 0);
              const meta = STATUS_META[n.status] ?? STATUS_META.PENDING;
              return (
                <div key={n.id} className="flex items-center gap-2">
                  <span className="text-[9.5px] text-slate-500 font-mono w-24 truncate shrink-0">{n.node.name}</span>
                  <div className="flex-1 h-3.5 rounded-sm overflow-hidden relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <motion.div
                      className="h-full rounded-sm"
                      style={{ background: `${meta.color}`, opacity: n.status === "RUNNING" ? 0.9 : 0.75 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${w}%` }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    />
                    {n.status === "RUNNING" && (
                      <motion.div
                        className="absolute inset-0 rounded-sm"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
                        animate={{ x: ["-100%", "200%"] }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                  </div>
                  <span className="text-[9.5px] font-mono w-16 text-right shrink-0" style={{ color: meta.color }}>{fmt(d)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Node details (Path tab) ── */}
          </motion.div>
        ) : (
          <motion.div
            key="path"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex-1 min-h-[300px] overflow-y-auto px-5 py-4 space-y-1.5"
          >
            {nodes.map((n, i) => (
              <NodeRow key={n.id} n={n} index={i} open={expanded.has(n.id)} onToggle={() => toggle(n.id)} />
            ))}
            {total === 0 && (
              <div className="text-center py-8">
                <Loader2 className="w-5 h-5 text-slate-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Waiting for the first node to report…</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function NodeRow({ n, index, open, onToggle }: { n: Ne; index: number; open: boolean; onToggle: () => void }) {
  const meta = STATUS_META[n.status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  const d = ms(n.startedAt, n.completedAt);
  const out = pretty(n.output);
  const inp = pretty(n.input);
  const hasData = !!(out || inp || n.error);
  const outBytes = jsonSize(n.output);
  const note = mockNote(n);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${open ? "rgba(124,58,237,0.35)" : "rgba(255,255,255,0.07)"}` }}>
      <button
        onClick={hasData ? onToggle : undefined}
        className="flex items-center gap-3 px-3.5 py-2.5 w-full text-left transition-colors hover:bg-white/[0.03]"
        style={{ cursor: hasData ? "pointer" : "default" }}
      >
        <span className="text-[10px] font-mono w-4 text-slate-600 shrink-0">{index + 1}</span>
        <Icon
          className={`w-3.5 h-3.5 shrink-0 ${n.status === "RUNNING" ? "animate-spin" : ""}`}
          style={{ color: meta.color }}
          strokeWidth={2.5}
        />
        <span className="text-[12.5px] text-slate-100 truncate font-medium flex-1 min-w-0">{n.node.name}</span>
        {note && (
          <span
            className="text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"
            style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)" }}
            title={note}
          >
            MOCK
          </span>
        )}
        <span className="text-[9.5px] text-slate-600 font-mono shrink-0">{n.node.type}</span>
        {outBytes > 0 && (
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded text-sky-300/80 shrink-0" style={{ background: "rgba(56,189,248,0.1)" }}>
            {outBytes >= 1024 ? `${(outBytes / 1024).toFixed(1)}KB` : `${outBytes}B`}
          </span>
        )}
        <span className="text-[10.5px] font-mono w-14 text-right shrink-0" style={{ color: d > 0 ? meta.color : "#475569" }}>{fmt(d)}</span>
        {hasData && <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />}
      </button>
      <AnimatePresence>
        {open && hasData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 space-y-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {n.error && (
                <div className="mt-2 px-2.5 py-1.5 rounded-md" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p className="text-[10px] text-red-300 font-mono leading-relaxed break-all">{n.error}</p>
                </div>
              )}
              {note && (
                <div className="mt-2 px-2.5 py-1.5 rounded-md" style={{ background: "rgba(251,191,36,0.09)", border: "1px solid rgba(251,191,36,0.25)" }}>
                  <p className="text-[10px] text-amber-200 font-medium leading-relaxed break-all">{note}</p>
                </div>
              )}
              {inp && (
                <div className="mt-2">
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Input</p>
                  <pre className="text-[10px] bg-black/40 rounded-md px-2.5 py-2 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto text-slate-400">
                    {inp.length > 600 ? inp.slice(0, 600) + "…" : inp}
                  </pre>
                </div>
              )}
              {out && (
                <div>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">Output</p>
                  <pre className="text-[10px] bg-black/40 rounded-md px-2.5 py-2 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto text-emerald-200/70">
                    {out.length > 800 ? out.slice(0, 800) + "…" : out}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
