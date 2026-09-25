"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  Zap, Brain, Globe, Mail, Database, MessageSquare, Shuffle,
  Check, Play, RotateCw, type LucideIcon,
} from "lucide-react";

/* ─── Node visuals ─────────────────────────────────────────────────────── */

const NODE_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  trigger:  { color: "#34d399", icon: Zap },
  ai:       { color: "#a78bfa", icon: Brain },
  switch:   { color: "#818cf8", icon: Shuffle },
  http:     { color: "#38bdf8", icon: Globe },
  email:    { color: "#f472b6", icon: Mail },
  database: { color: "#2dd4bf", icon: Database },
  slack:    { color: "#c084fc", icon: MessageSquare },
};

/* ─── Hand-tuned symmetric workflow (a general-purpose automation) ───────
   A central spine: Webhook → AI → Router, fanning into three symmetric
   branches that merge back into a sync. 11 nodes, mirrored left/right. */

const NODE_W = 132;
const NODE_H = 48;
const WORLD_W = 1180;
const WORLD_H = 352;

type N = { id: number; type: string; label: string; x: number; y: number };
type E = { from: number; to: number; tag?: string };

const NODES: N[] = [
  { id: 0, type: "trigger",  label: "Webhook Trigger", x: 524, y: 6 },   // center
  { id: 1, type: "ai",       label: "AI Enrichment",   x: 524, y: 76 },  // center
  { id: 2, type: "switch",   label: "Filter & Route",  x: 524, y: 146 }, // router
  { id: 3, type: "http",     label: "HTTP Fetch",      x: 214, y: 216 }, // left
  { id: 4, type: "email",    label: "Email Digest",    x: 524, y: 216 }, // center
  { id: 5, type: "database", label: "DB Lookup",       x: 834, y: 216 }, // right
  { id: 6, type: "slack",    label: "Slack Notify",    x: 214, y: 286 }, // left
  { id: 7, type: "database", label: "Sync Database",   x: 524, y: 286 }, // merge
  { id: 8, type: "slack",    label: "Slack Alert",     x: 834, y: 286 }, // right
];

const EDGES: E[] = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3, tag: "high" },
  { from: 2, to: 4, tag: "normal" },
  { from: 2, to: 5, tag: "low" },
  { from: 3, to: 6 },
  { from: 5, to: 8 },
  { from: 6, to: 7 },
  { from: 4, to: 7 },
  { from: 8, to: 7 },
];

/* Demo execution order (router → branches → merge) */
const ORDER = [0, 1, 2, 3, 4, 5, 6, 8, 7];

const STEP_LABELS = [
  "Webhook received",
  "AI enrichment done",
  "Routes evaluated",
  "Fetched via HTTP",
  "Digest queued",
  "Lookup complete",
  "Slack notified",
  "Alert posted",
  "Synced to database",
];

function edgePath(e: E) {
  const a = NODES[e.from];
  const b = NODES[e.to];
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

/* ═══════════════════════════════════════════════════════════════════════ */

export function HeroCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [step, setStep] = useState(-1);
  const [runId, setRunId] = useState(0);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / WORLD_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Execution demo: auto-plays, then loops with a pause. runId restarts it. */
  useLayoutEffect(() => {
    if (step < 0) {
      const t = setTimeout(() => setStep(0), 900);
      return () => clearTimeout(t);
    }
    if (step >= ORDER.length) {
      const t = setTimeout(() => setStep(0), 2800);
      return () => clearTimeout(t);
    }
    const isLast = step === ORDER.length - 1;
    const t = setTimeout(() => setStep((s) => s + 1), isLast ? 1500 : 620);
    return () => clearTimeout(t);
  }, [step, runId]);

  const restart = () => {
    setStep(-1);
    setRunId((n) => n + 1);
  };

  const done = step >= ORDER.length;
  const completed = done ? ORDER.length : Math.max(step, 0);
  const runningEdge =
    !done && step > 0 ? EDGES.find((e) => e.to === ORDER[step]) : null;

  const statusOf = (id: number): "pending" | "running" | "success" => {
    const pos = ORDER.indexOf(id);
    if (pos < step) return "success";
    if (pos === step && !done) return "running";
    return "pending";
  };

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
      style={{
        background: "linear-gradient(180deg, #0b0e16, #070910)",
        border: "1px solid rgba(255,255,255,0.09)",
      }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 h-11"
        style={{ background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex gap-1.5 mr-1">
          <span className="w-3 h-3 rounded-full bg-red-500/40" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/40" />
          <span className="w-3 h-3 rounded-full bg-green-500/40" />
        </div>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-[12px] text-slate-300 font-medium truncate">Automation Workflow</span>
        <span
          className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={
            done
              ? { background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#6ee7b7" }
              : { background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", color: "#c4b5fd" }
          }
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: done ? "#34d399" : "#a78bfa", animation: done ? "none" : "pulse-violet 1.6s infinite" }}
          />
          {done ? "Completed" : "Executing"}
        </span>
        <div className="flex-1" />
        <button
          onClick={restart}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 2px 10px rgba(124,58,237,0.35)" }}
        >
          {done ? <RotateCw className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
          {done ? "Run again" : "Run"}
        </button>
      </div>

      {/* ── Canvas (no sidebar — full width) ── */}
      <div className="relative p-2" style={{ height: WORLD_H * scale + 16 }}>
        <div
          ref={canvasRef}
          className="relative w-full overflow-hidden rounded-lg"
          style={{ height: WORLD_H * scale }}
        >
          {/* Grey dot grid */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.30) 1.2px, transparent 1.4px)",
              backgroundSize: `${22 * scale}px ${22 * scale}px`,
              backgroundPosition: `${11 * scale}px ${11 * scale}px`,
            }}
          />

          <div
            className="absolute top-0 left-0"
            style={{ width: WORLD_W, height: WORLD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            {/* Edges */}
            <svg className="absolute inset-0" width={WORLD_W} height={WORLD_H} style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="hero-edge" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              {EDGES.map((e, i) => {
                const isRunning = runningEdge === e;
                const color = isRunning ? "url(#hero-edge)" : "rgba(148,163,184,0.4)";
                return (
                  <g key={i}>
                    <path
                      d={edgePath(e)}
                      fill="none"
                      stroke={color}
                      strokeWidth={isRunning ? 2.5 : 1.75}
                      strokeLinecap="round"
                      style={{ transition: "stroke 0.4s, stroke-width 0.4s" }}
                    />
                    {isRunning && (
                      <>
                        <path id={`hero-edge-${i}`} d={edgePath(e)} fill="none" stroke="none" />
                        <circle r={3.5} fill="#c4b5fd">
                          <animateMotion dur="1s" repeatCount="indefinite" rotate="auto">
                            <mpath href={`#hero-edge-${i}`} xlinkHref={`#hero-edge-${i}`} />
                          </animateMotion>
                        </circle>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Branch tags */}
            {EDGES.filter((e) => e.tag).map((e, i) => {
              const a = NODES[e.from];
              const b = NODES[e.to];
              const mx = (a.x + b.x) / 2 + NODE_W / 2;
              const my = (a.y + b.y) / 2 + NODE_H;
              return (
                <span
                  key={`tag-${i}`}
                  className="absolute text-[9px] font-mono select-none"
                  style={{ left: mx - 18, top: my - 8, color: "#818cf8" }}
                >
                  {e.tag}
                </span>
              );
            })}

            {/* Nodes */}
            {NODES.map((n, i) => {
              const st = NODE_STYLE[n.type];
              const Icon = st.icon;
              const status = statusOf(n.id);
              const isActive = status === "running";
              const isSuccess = status === "success";
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.07, type: "spring", stiffness: 220, damping: 20 }}
                  className="absolute"
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                >
                  <div
                    className="relative w-full h-full rounded-xl flex items-center gap-2 px-2.5"
                    style={{
                      background: isActive ? "#111827" : "rgba(17,24,39,0.92)",
                      border: `1.5px solid ${isActive ? st.color : isSuccess ? `${st.color}66` : "rgba(255,255,255,0.1)"}`,
                      boxShadow: isActive
                        ? `0 0 0 3px ${st.color}22, 0 0 22px ${st.color}40, 0 8px 24px rgba(0,0,0,0.5)`
                        : "0 1px 3px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.25)",
                      transition: "border-color 0.4s, box-shadow 0.4s, background 0.4s",
                    } as CSSProperties}
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${st.color}24`, border: `1px solid ${st.color}45` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: st.color }} />
                    </span>
                    <span className="text-[10.5px] font-medium text-slate-200 truncate">
                      {n.label}
                    </span>

                    {/* n8n-style handles */}
                    <span
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
                      style={{ background: "#1e293b", borderColor: isActive ? st.color : "#475569" }}
                    />
                    <span
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
                      style={{ background: "#1e293b", borderColor: isActive ? st.color : "#475569" }}
                    />

                    {/* Status pip: pending dot / running spinner / success tick */}
                    <span
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0b0e16]"
                      style={{
                        background: isActive ? "#1e293b" : isSuccess ? "rgba(52,211,153,0.16)" : "transparent",
                        borderColor: isActive ? st.color : isSuccess ? "#34d399" : "transparent",
                        boxShadow: isActive ? `0 0 10px ${st.color}66` : "none",
                        transition: "all 0.4s",
                      }}
                    >
                      {isActive && (
                        <span
                          className="w-2.5 h-2.5 rounded-full border-2 border-white/20 border-t-white animate-spin"
                          style={{ borderTopColor: st.color }}
                        />
                      )}
                      {isSuccess && <Check className="w-3 h-3 text-emerald-400" strokeWidth={3.5} />}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Execution log — tickmarks of completed steps ── */}
      <div
        className="flex items-center gap-2 px-4 h-10 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-[10px] font-mono text-slate-600 shrink-0">
          {done ? "9/9" : completed > 0 ? `${completed}/9` : "—"}
        </span>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {STEP_LABELS.slice(0, completed).map((label, i) => (
            <motion.span
              key={`${runId}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}
            >
              <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3.5} />
              <span className="text-[9.5px] text-emerald-300/90 font-medium whitespace-nowrap">{label}</span>
            </motion.span>
          ))}
          {!done && completed === 0 && (
            <span className="text-[10px] text-slate-700 font-mono">waiting for trigger…</span>
          )}
        </div>
      </div>
    </div>
  );
}
