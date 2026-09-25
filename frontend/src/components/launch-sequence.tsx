"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, Clock, Circle, ChevronRight, ChevronDown,
} from "lucide-react";
import { getExecution, type PersistedExecution } from "@/lib/workflow-api";

/* Launch sequence — a full-stage countdown that follows the REAL execution.
 *
 * The overlay polls the live execution while the countdown plays, then resolves
 * to one of two finales driven by the actual outcome:
 *  - SUCCESS → the rocket climbs away under a boosted flame and a happy emoji lands
 *  - FAILED  → the rocket BURSTS (flash, shockwave, debris) and a sad emoji shows
 *              exactly what went wrong
 * Nothing here is fake: the finale only fires once the execution reports a
 * terminal status from the API. */

type Stage = "countdown" | "ascent" | "finale";
type Outcome = "success" | "failed";

const COUNTDOWN = [
  { n: 3, label: "Initializing nodes" },
  { n: 2, label: "Validating connections" },
  { n: 1, label: "Igniting triggers" },
] as const;

const POLL_MS = 450;
const FINALE_HOLD_MS = 3400;
const BURST_AT = 0.45; /* when the rocket bursts apart on failure */

const STEP_META: Record<string, { color: string; icon: typeof CheckCircle2; spin?: boolean }> = {
  SUCCESS:  { color: "#34d399", icon: CheckCircle2 },
  FAILED:   { color: "#f87171", icon: XCircle },
  RUNNING:  { color: "#fbbf24", icon: Loader2, spin: true },
  WAITING:  { color: "#7dd3fc", icon: Clock },
  PENDING:  { color: "#64748b", icon: Circle },
  SKIPPED:  { color: "#475569", icon: ChevronDown },
};

/* ── detailed rocket ─────────────────────────────────────────────────────── */

function Rocket({ flame }: { flame: "off" | "on" | "boost" }) {
  return (
    <svg
      width={118}
      height={253}
      viewBox="0 0 140 300"
      fill="none"
      className="drop-shadow-[0_18px_30px_rgba(124,58,237,0.35)]"
    >
      <defs>
        <linearGradient id="rk-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="rk-nose" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9a8d4" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="rk-fin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id="rk-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.35" stopColor="#fbbf24" />
          <stop offset="0.7" stopColor="#f97316" />
          <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="rk-window" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1e3a8a" />
        </radialGradient>
      </defs>

      {/* nose cone */}
      <path d="M70 6 L106 70 L34 70 Z" fill="url(#rk-nose)" />
      <path d="M70 6 L106 70 L88 70 Z" fill="#ffffff" opacity="0.22" />

      {/* body */}
      <rect x="34" y="66" width="72" height="104" rx="20" fill="url(#rk-body)" />
      <rect x="34" y="66" width="20" height="104" rx="10" fill="#ffffff" opacity="0.35" />

      {/* window */}
      <circle cx="70" cy="102" r="17" fill="url(#rk-window)" stroke="#7c3aed" strokeWidth="3.5" />
      <circle cx="64" cy="96" r="4.5" fill="#e0f2fe" opacity="0.85" />

      {/* belt + rivets */}
      <rect x="34" y="128" width="72" height="9" fill="#7c3aed" opacity="0.55" />
      <circle cx="52" cy="150" r="3" fill="#6d28d9" opacity="0.6" />
      <circle cx="70" cy="150" r="3" fill="#6d28d9" opacity="0.6" />
      <circle cx="88" cy="150" r="3" fill="#6d28d9" opacity="0.6" />

      {/* fins */}
      <path d="M34 132 L11 191 L34 175 Z" fill="url(#rk-fin)" />
      <path d="M106 132 L129 191 L106 175 Z" fill="url(#rk-fin)" />

      {/* engine + nozzle */}
      <rect x="44" y="170" width="52" height="18" rx="9" fill="#5b21b6" />
      <path d="M52 188 L88 188 L80 209 L60 209 Z" fill="#312e81" />

      {/* ── flame: layered plume anchored at the nozzle ── */}
      <motion.g
        style={{ transformOrigin: "70px 208px" }}
        initial={false}
        animate={
          flame === "off"
            ? { scaleY: 0.1, opacity: 0 }
            : flame === "boost"
            ? {
                scaleY: [1.1, 1.42, 1.18, 1.45, 1.15],
                scaleX: [1.03, 1.2, 1.04, 1.22, 1.03],
                y: [0, -2, 0, -2, 0],
                opacity: 1,
              }
            : {
                scaleY: [1, 1.14, 0.93, 1.08, 1],
                scaleX: [1, 0.95, 1.06, 0.96, 1],
                y: [0, -1, 1, -1, 0],
                opacity: 1,
              }
        }
        transition={
          flame === "off"
            ? { duration: 0.2 }
            : { duration: 0.5, repeat: Infinity, ease: "easeInOut" }
        }
      >
        {/* outer plume — tallest, wraps everything */}
        <path
          d="M70 207 C 50 232, 48 266, 70 298 C 92 266, 90 232, 70 207 Z"
          fill="url(#rk-flame)"
          opacity="0.92"
        />
        {/* mid flame */}
        <path
          d="M70 210 C 57 229, 56 252, 70 274 C 84 252, 83 229, 70 210 Z"
          fill="#fb923c"
          opacity="0.95"
        />
        {/* inner white-hot core */}
        <path
          d="M70 214 C 63 227, 62 242, 70 258 C 78 242, 77 227, 70 214 Z"
          fill="#fef9c3"
        />
        {/* side wisps spilling from the nozzle lip */}
        <path d="M56 211 C 49 228, 52 246, 59 257 C 63 243, 61 224, 56 211 Z" fill="#fdba74" opacity="0.85" />
        <path d="M84 211 C 91 228, 88 246, 81 257 C 77 243, 79 224, 84 211 Z" fill="#fdba74" opacity="0.85" />
      </motion.g>

      {/* ── embers drifting down from the flame ── */}
      <g opacity={flame === "off" ? 0 : 1}>
        {EMBERS.map((e, i) => (
          <motion.circle
            key={i}
            cx={e.x}
            cy={212}
            r={e.r}
            fill="#fbbf24"
            initial={{ cy: 212, opacity: 0 }}
            animate={{ cy: [212, 248, 270], opacity: [0, 1, 0] }}
            transition={{ duration: e.dur, delay: e.delay, repeat: Infinity, ease: "easeOut", times: [0, 0.5, 1] }}
          />
        ))}
      </g>
    </svg>
  );
}

/* ── component ───────────────────────────────────────────────────────────── */

export function LaunchSequence({
  workflowName,
  nodeNames,
  executionId,
  runError,
  onComplete,
}: {
  workflowName: string;
  nodeNames: string[];
  executionId: string | null;
  runError: string | null;
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<Stage>("countdown");
  const [tick, setTick] = useState(0);
  const [countdownDone, setCountdownDone] = useState(false);
  const [execution, setExecution] = useState<PersistedExecution | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [failedNode, setFailedNode] = useState<string | null>(null);

  /* countdown 3 · 2 · 1 */
  useEffect(() => {
    if (stage !== "countdown") return;
    if (tick >= COUNTDOWN.length) {
      setCountdownDone(true);
      setStage("ascent");
      return;
    }
    const t = setTimeout(() => setTick((v) => v + 1), 800);
    return () => clearTimeout(t);
  }, [tick, stage]);

  /* poll the real execution while the show plays */
  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getExecution(executionId);
        if (cancelled) return;
        setExecution(res.execution);
        if (res.execution.status === "SUCCESS") {
          setOutcome("success");
        } else if (res.execution.status === "FAILED" || res.execution.status === "CANCELLED") {
          const bad = res.execution.nodeExecutions.find((n) => n.status === "FAILED" && n.error);
          setOutcome("failed");
          setFailedNode(bad?.node.name ?? null);
          setFailMessage(res.execution.error ?? bad?.error ?? "The workflow stopped before completing.");
        }
      } catch {
        /* transient — keep polling; the parent surfaces hard request failures */
      }
    };
    void poll();
    const iv = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [executionId]);

  /* the run request itself failed */
  useEffect(() => {
    if (runError) {
      setOutcome("failed");
      setFailMessage(runError);
    }
  }, [runError]);

  /* finale — only once the countdown is done AND the real outcome is known */
  useEffect(() => {
    if (!countdownDone || !outcome) return;
    setStage("finale");
    const t = setTimeout(onComplete, FINALE_HOLD_MS);
    return () => clearTimeout(t);
  }, [countdownDone, outcome, onComplete]);

  const steps = execution
    ? execution.nodeExecutions.map((ne) => ({ name: ne.node.name, status: ne.status }))
    : nodeNames.map((name) => ({ name, status: "PENDING" as const }));

  const successCount = steps.filter((s) => s.status === "SUCCESS").length;
  const skippedCount = steps.filter((s) => s.status === "SKIPPED").length;
  const reportedCount = steps.filter((s) => s.status === "SUCCESS" || s.status === "FAILED").length;

  const flame: "off" | "on" | "boost" =
    stage === "finale" ? (outcome === "success" ? "boost" : "off") : "on";

  /* rocket motion: hover during countdown/ascent, fly away on success,
   * pressurize-then-vanish at the burst point on failure. */
  const rocketAnimate =
    stage === "finale" && outcome === "success"
      ? { y: [0, -60, -320, -560], opacity: [1, 1, 0.9, 0], scale: [1, 1.02, 0.95, 0.75], rotate: [0, 0, -2, 1] }
      : stage === "finale" && outcome === "failed"
      ? { scale: [1, 1.08, 1.15, 0.9], rotate: [0, -3, 4, -2], opacity: [1, 1, 1, 0], y: [0, -4, 2, 6] }
      : stage === "ascent"
      ? { y: [0, -16, 0], rotate: [0, -1.5, 1.5, 0] }
      : { x: [0, -3, 3, -2, 2, 0], rotate: [0, -1.5, 1.5, -1, 1, 0] };

  const rocketTransition =
    stage === "finale"
      ? outcome === "success"
        ? { duration: 1.3, ease: [0.32, 0, 0.4, 1] as const, times: [0, 0.2, 0.65, 1] }
        : { duration: BURST_AT + 0.2, ease: "easeOut" as const, times: [0, 0.45, 0.75, 1] }
      : stage === "ascent"
      ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const }
      : { duration: 0.4, repeat: Infinity, ease: "linear" as const };

  const showFinale = stage === "finale";
  const showBurst = showFinale && outcome === "failed";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[120] overflow-y-auto flux-scroll"
      style={{ background: "rgba(3, 5, 8, 0.88)", backdropFilter: "blur(12px)" }}
    >
      <div className="min-h-full flex items-center justify-center">
        <div className="relative w-full max-w-xl px-6 py-10 flex flex-col items-center">
          {/* starfield */}
          <div className="absolute inset-0 pointer-events-none">
            {STARS.map((s, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, opacity: s.o }}
              />
            ))}
          </div>

          {/* ground glow */}
          <motion.div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[640px] h-[340px] rounded-[50%] pointer-events-none"
            style={{ background: "radial-gradient(closest-side, rgba(124,58,237,0.28), transparent)" }}
            animate={{ opacity: showBurst ? 0.2 : 1 }}
            transition={{ duration: 0.8 }}
          />

          {/* workflow name */}
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-flux-300/80 mb-1"
          >
            {workflowName}
          </motion.p>
          <p className="relative text-[10px] text-slate-500 font-mono mb-5">
            {steps.length} node{steps.length === 1 ? "" : "s"} · mission control
          </p>

          {/* ── stage: rocket, burst effects, finale emoji ── */}
          <div className="relative h-[280px] w-full flex items-end justify-center">
            {/* BURST: flash + shockwave + fireball + debris (failure only) */}
            {showBurst && (
              <>
                {/* flash */}
                <motion.span
                  className="absolute bottom-[185px] rounded-full pointer-events-none"
                  style={{
                    left: "calc(50% - 110px)",
                    width: 220,
                    height: 220,
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.95), rgba(254,240,138,0.6) 35%, rgba(249,115,22,0.25) 65%, transparent 78%)",
                  }}
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: [0.2, 1.5, 2.4], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6, delay: BURST_AT, ease: "easeOut", times: [0, 0.35, 1] }}
                />
                {/* fireball */}
                <motion.span
                  className="absolute bottom-[185px] rounded-full pointer-events-none"
                  style={{
                    left: "calc(50% - 80px)",
                    width: 160,
                    height: 160,
                    background:
                      "radial-gradient(circle, rgba(254,243,199,0.95) 0%, rgba(251,146,60,0.85) 40%, rgba(239,68,68,0.55) 70%, transparent 82%)",
                  }}
                  initial={{ scale: 0.25, opacity: 0 }}
                  animate={{ scale: [0.25, 1.15, 1.55], opacity: [0, 0.95, 0] }}
                  transition={{ duration: 0.95, delay: BURST_AT, ease: "easeOut", times: [0, 0.4, 1] }}
                />
                {/* shockwave rings */}
                {[0, 0.12].map((d, i) => (
                  <motion.span
                    key={i}
                    className="absolute bottom-[185px] rounded-full pointer-events-none"
                    style={{
                      left: "calc(50% - 100px)",
                      width: 200,
                      height: 200,
                      border: "2px solid rgba(251,146,60,0.9)",
                    }}
                    initial={{ scale: 0.15, opacity: 0 }}
                    animate={{ scale: [0.15, 1, 1.7], opacity: [0, 0.85, 0] }}
                    transition={{ duration: 0.85, delay: BURST_AT + d, ease: "easeOut", times: [0, 0.4, 1] }}
                  />
                ))}
                {/* debris shards flying out with gravity fall */}
                <div className="absolute bottom-[185px] left-1/2 pointer-events-none">
                  {DEBRIS.map((d, i) => {
                    const h = d.round ? d.size : d.size * 0.72;
                    return (
                      <motion.span
                        key={i}
                        className="absolute"
                        style={{
                          backgroundColor: d.color,
                          width: d.size,
                          height: h,
                          borderRadius: d.round ? "50%" : "1px",
                          marginLeft: -d.size / 2,
                          marginTop: -h / 2,
                        }}
                        initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                        animate={{
                          x: [0, d.dx * 0.35, d.dx * 0.8, d.dx],
                          y: [0, d.up * 0.8, d.up, d.up + 140],
                          rotate: [0, d.rot * 0.3, d.rot * 0.7, d.rot],
                          opacity: [0, 1, 1, 0],
                        }}
                        transition={{
                          duration: 1.35,
                          delay: BURST_AT,
                          ease: "easeOut",
                          times: [0, 0.08, 0.45, 1],
                        }}
                      />
                    );
                  })}
                </div>
                {/* smoke after the burst */}
                {SMOKE.map((s, i) => (
                  <motion.span
                    key={i}
                    className="absolute bottom-12 rounded-full pointer-events-none"
                    style={{
                      left: `calc(50% + ${s.dx}px - ${s.size / 2}px)`,
                      background: "rgba(148,163,184,0.45)",
                      width: s.size,
                      height: s.size,
                    }}
                    initial={{ scale: 0.2, opacity: 0, y: 0 }}
                    animate={{ scale: [0.2, 1, 1.3], opacity: [0, 0.8, 0], y: [0, -50 - i * 12] }}
                    transition={{ duration: 1.6, delay: BURST_AT + 0.15 + i * 0.1, ease: "easeOut", times: [0, 0.45, 1] }}
                  />
                ))}
              </>
            )}

            {/* CONFETTI (success only) */}
            {showFinale && outcome === "success" && (
              <>
                {CONFETTI.map((c, i) => (
                  <motion.span
                    key={i}
                    className="absolute top-20 rounded-[2px] pointer-events-none"
                    style={{ left: `calc(50% + ${c.dx}px)`, backgroundColor: c.color, width: c.size, height: c.size * 0.6 }}
                    initial={{ y: -20, opacity: 0, rotate: 0 }}
                    animate={{ y: [-20, 60, 300], opacity: [0, 1, 1, 0], rotate: [0, 200, 400] }}
                    transition={{ duration: 1.9, delay: 0.5 + i * 0.06, ease: "easeIn", times: [0, 0.15, 0.8, 1] }}
                  />
                ))}
              </>
            )}

            {/* the rocket — outer wrapper centers it, inner motion.div animates.
                One element: its animate target swaps from hover to fly-off /
                burst in place, so there's no flicker at the handoff. */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
              <motion.div animate={rocketAnimate} transition={rocketTransition}>
                <Rocket flame={flame} />
              </motion.div>
            </div>

            {/* finale emoji, replacing the rocket in the stage */}
            <AnimatePresence>
              {showFinale && (
                <motion.div
                  key="finale-emoji"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    delay: outcome === "success" ? 1.0 : 0.8,
                    type: "spring",
                    stiffness: 260,
                    damping: 16,
                  }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <motion.span
                    className="text-[68px] leading-none"
                    animate={{ rotate: [0, -8, 8, -8, 0] }}
                    transition={{ duration: 0.6, delay: outcome === "success" ? 1.1 : 0.9, repeat: 2 }}
                  >
                    {outcome === "success" ? "🎉" : "😞"}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── detail area: countdown / live status / finale message ──
              Kept out of the fixed-height stage so text never clips or
              misaligns; the error card gets the full panel width. */}
          <div
            className="relative w-full min-h-[150px] flex flex-col items-center justify-center"
            aria-live="polite"
          >
            <AnimatePresence mode="wait">
              {stage === "countdown" && tick < COUNTDOWN.length ? (
                <motion.div
                  key={`cd-${tick}`}
                  initial={{ opacity: 0, scale: 0.7, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.25, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-4xl font-bold text-white font-mono tabular-nums">
                    {COUNTDOWN[tick].n}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">{COUNTDOWN[tick].label}</span>
                </motion.div>
              ) : showFinale ? (
                <motion.div
                  key="finale-detail"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.3 }}
                  className="w-full flex flex-col items-center"
                >
                  {outcome === "success" ? (
                    <>
                      <h2 className="text-xl font-bold text-white">Execution successful</h2>
                      <p className="mt-1.5 text-[12px] text-emerald-300/90 text-center">
                        {successCount} node{successCount === 1 ? "" : "s"} finished cleanly
                        {skippedCount > 0 ? ` · ${skippedCount} skipped by branching` : ""}.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold text-white">Execution failed</h2>
                      {failedNode && (
                        <span
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-mono"
                          style={{
                            color: "#fcd34d",
                            background: "rgba(251,191,36,0.12)",
                            border: "1px solid rgba(251,191,36,0.32)",
                          }}
                        >
                          <XCircle className="w-3 h-3" />
                          Failed at node: {failedNode}
                        </span>
                      )}
                      {/* What went wrong — full width, readable size, wraps
                          properly instead of breaking mid-word. */}
                      <div
                        className="mt-3 w-full rounded-xl px-4 py-3 text-left"
                        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}
                      >
                        <p className="text-[9.5px] font-bold text-red-300/80 uppercase tracking-[0.14em] mb-1.5">
                          What went wrong
                        </p>
                        <p className="text-[12.5px] font-mono leading-relaxed text-red-100 whitespace-pre-wrap break-words max-h-[110px] overflow-y-auto flux-scroll">
                          {failMessage ?? "Unknown failure"}
                        </p>
                      </div>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="running"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="text-[12px] font-semibold text-white flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {execution ? "Workflow executing" : "Starting execution…"}
                  </span>
                  <span className="text-[10.5px] text-slate-500">
                    {reportedCount} / {steps.length} nodes reported
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── per-node checklist ── */}
          <div className="relative w-full max-w-sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                Flight path
              </p>
              {showFinale && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={onComplete}
                  className="flex items-center gap-1 text-[10px] font-semibold text-flux-300 hover:text-flux-200 transition-colors"
                >
                  View analysis <ChevronRight className="w-3 h-3" />
                </motion.button>
              )}
            </div>
            <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 flux-scroll">
              {steps.length === 0 && (
                <p className="text-[11px] text-slate-600 text-center py-3">No nodes in this workflow</p>
              )}
              {steps.map((s, i) => {
                const meta = STEP_META[s.status] ?? STEP_META.PENDING;
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={`${s.name}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4) }}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${meta.spin ? "animate-spin" : ""}`}
                      style={{ color: meta.color }}
                      strokeWidth={2.5}
                    />
                    <span className="text-[11.5px] text-slate-200 truncate flex-1 min-w-0">{s.name}</span>
                    <span className="text-[9px] font-mono uppercase shrink-0" style={{ color: meta.color }}>
                      {s.status}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* escape hatch during a long run */}
          {!showFinale && countdownDone && (
            <button
              onClick={onComplete}
              className="relative mt-4 text-[10.5px] font-medium text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
            >
              Open live analysis
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37.7) % 100,
  y: (i * 61.3) % 100,
  r: `${(i % 3) + 1}px`,
  o: 0.15 + ((i % 5) * 0.11),
}));

const EMBERS = [
  { x: 58, r: 2.0, dur: 1.3, delay: 0.0 },
  { x: 70, r: 1.5, dur: 1.6, delay: 0.3 },
  { x: 82, r: 2.2, dur: 1.1, delay: 0.55 },
  { x: 64, r: 1.4, dur: 1.8, delay: 0.8 },
  { x: 76, r: 1.8, dur: 1.4, delay: 1.0 },
];

const SMOKE = [
  { dx: -52, size: 34 },
  { dx: 44, size: 28 },
  { dx: -16, size: 44 },
  { dx: 24, size: 24 },
  { dx: -76, size: 20 },
  { dx: 70, size: 22 },
];

const CONFETTI = Array.from({ length: 16 }, (_, i) => ({
  dx: ((i % 8) - 4) * 22 + ((i * 13) % 17) - 8,
  color: ["#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#38bdf8"][i % 5],
  size: 7 + (i % 3) * 2,
}));

const DEBRIS = [
  { dx: -150, up: -80, rot: -300, color: "#a78bfa", size: 10, round: false },
  { dx: 130, up: -105, rot: 260, color: "#f472b6", size: 9, round: true },
  { dx: -95, up: -130, rot: -180, color: "#fbbf24", size: 8, round: false },
  { dx: 105, up: -60, rot: 340, color: "#ffffff", size: 7, round: true },
  { dx: -40, up: -150, rot: -420, color: "#6d28d9", size: 9, round: false },
  { dx: 60, up: -140, rot: 200, color: "#a78bfa", size: 8, round: true },
  { dx: -120, up: -40, rot: -260, color: "#f472b6", size: 7, round: false },
  { dx: 145, up: -30, rot: 300, color: "#fbbf24", size: 10, round: false },
  { dx: -70, up: -55, rot: -120, color: "#ffffff", size: 6, round: true },
  { dx: 85, up: -115, rot: 420, color: "#6d28d9", size: 9, round: false },
  { dx: 20, up: -160, rot: 160, color: "#fbbf24", size: 8, round: true },
  { dx: -25, up: -35, rot: -340, color: "#a78bfa", size: 7, round: false },
];
