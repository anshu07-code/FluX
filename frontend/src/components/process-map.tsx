"use client";

import { motion } from "framer-motion";
import {
  Zap, ArrowRight, Sparkles, GitBranch, Clock, RefreshCw, Timer,
  AlertTriangle, CheckCircle2, Database, Mail, Code, Webhook,
  type LucideIcon,
} from "lucide-react";

/* ─── Shared palette ────────────────────────────────────────────────────── */

export const NODE_COLORS: Record<string, string> = {
  trigger: "#34d399", http: "#38bdf8", ai: "#a78bfa", condition: "#fbbf24",
  email: "#f472b6", database: "#2dd4bf", code: "#22d3ee", webhook: "#fb923c",
  delay: "#94a3b8", slack: "#c084fc", loop: "#22d3ee", wait: "#7dd3fc",
  document: "#fde047", filter: "#4ade80", approval: "#f472b6", set: "#f9a8d4",
  switch: "#fcd34d", merge: "#818cf8", split: "#818cf8", error: "#f87171",
  auth: "#a78bfa", idempotency: "#94a3b8", schedule: "#7dd3fc", response: "#34d399",
};

export const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "#34d399", FAILED: "#f87171", RUNNING: "#38bdf8", WAITING: "#7dd3fc",
  PENDING: "#64748b", SKIPPED: "#475569", CANCELLED: "#64748b",
};

export const STATUS_BG: Record<string, string> = {
  SUCCESS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  FAILED: "bg-red-500/10 text-red-400 border-red-500/30",
  RUNNING: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  WAITING: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  PENDING: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  SKIPPED: "bg-slate-500/10 text-slate-500 border-slate-500/30",
  CANCELLED: "bg-slate-500/10 text-slate-500 border-slate-500/30",
};

export type IconType = LucideIcon;

export const NODE_TYPE_ICONS: Record<string, IconType> = {
  trigger: Zap, http: ArrowRight, ai: Sparkles, condition: GitBranch, email: Mail,
  database: Database, code: Code, webhook: Webhook, delay: Clock,
  slack: ArrowRight, loop: RefreshCw, wait: Timer, document: ArrowRight,
  filter: GitBranch, approval: CheckCircle2, set: ArrowRight, switch: GitBranch,
  merge: GitBranch, split: GitBranch, error: AlertTriangle, auth: ArrowRight,
  idempotency: ArrowRight, schedule: Clock, response: ArrowRight,
};

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatMs(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function execDuration(ex: { startedAt: string | null; completedAt: string | null }): number {
  if (!ex.startedAt) return 0;
  const end = ex.completedAt ? new Date(ex.completedAt).getTime() : Date.now();
  return end - new Date(ex.startedAt).getTime();
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BG[status] ?? STATUS_BG.PENDING;
  const Spinner = status === "RUNNING" || status === "WAITING";
  const Icon = status === "SUCCESS" ? CheckCircle2 : status === "FAILED" ? AlertTriangle : Clock;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cls}`}>
      {Spinner ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Icon className="w-2.5 h-2.5" />}
      {status}
    </span>
  );
}

/* ─── Process map ───────────────────────────────────────────────────────── */

export type ProcessMapNode = {
  id: string;
  status: string;
  node: { name: string; type: string };
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
};

/** Duration / progress text shown in the node hover tooltip. */
function nodeDurationLabel(ne: ProcessMapNode): string | null {
  if (ne.startedAt && ne.completedAt) {
    const ms = new Date(ne.completedAt).getTime() - new Date(ne.startedAt).getTime();
    if (ms >= 0) return formatMs(ms);
  }
  if (ne.status === "RUNNING" || ne.status === "WAITING") return "running…";
  if (ne.startedAt) return "in progress";
  return null;
}

export function ProcessMap({
  nodes,
  size = "md",
  showLabels = true,
}: {
  nodes: ProcessMapNode[];
  size?: "sm" | "md";
  showLabels?: boolean;
}) {
  if (nodes.length === 0) {
    return <span className="text-[11px] text-slate-600 italic">No nodes recorded</span>;
  }
  const box = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const icon = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const labelW = size === "sm" ? "max-w-[44px]" : "max-w-[56px]";

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {nodes.map((ne, i) => {
        const color = NODE_COLORS[ne.node.type] ?? "#a78bfa";
        const sc = STATUS_COLORS[ne.status] ?? "#64748b";
        const Icon = NODE_TYPE_ICONS[ne.node.type] ?? Zap;
        const active = ne.status === "RUNNING" || ne.status === "WAITING";
        const durationLabel = nodeDurationLabel(ne);
        // Keep the tooltip inside overflow-hidden cards: anchor the first node
        // left, the last node right, everything else centered.
        const tipAlign =
          i === 0 ? "left-0" : i === nodes.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
        return (
          <div key={ne.id} className="flex items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.045, type: "spring", stiffness: 300, damping: 20 }}
              className="relative flex flex-col items-center gap-1 group"
            >
              {active && (
                <span
                  className="absolute -inset-1 rounded-lg animate-ping opacity-30"
                  style={{ backgroundColor: sc }}
                />
              )}

              {/* Hover detail card — name, type, status, timing and error in
                  one place (the native title attribute only ever showed a
                  single flat line and never rendered on touch). */}
              <div
                role="tooltip"
                className={`pointer-events-none absolute bottom-full mb-2 z-50 w-max max-w-[240px] rounded-lg border border-dark-600 bg-[#0b1220] px-3 py-2 opacity-0 shadow-xl shadow-black/60 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${tipAlign}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-white truncate">
                    {ne.node.name || ne.node.type}
                  </span>
                  <span
                    className="text-[9px] font-semibold px-1 py-px rounded uppercase tracking-wide shrink-0"
                    style={{ color: sc, background: `${sc}1f` }}
                  >
                    {ne.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                  <span className="font-mono uppercase tracking-wide" style={{ color }}>
                    {ne.node.type}
                  </span>
                  {durationLabel && (
                    <>
                      <span className="text-slate-600">·</span>
                      <span className="font-mono">{durationLabel}</span>
                    </>
                  )}
                </div>
                {ne.error && (
                  <p className="mt-1 text-[10px] leading-snug text-red-400/90 break-words line-clamp-3">
                    {ne.error}
                  </p>
                )}
              </div>

              <div
                className={`relative ${box} rounded-lg flex items-center justify-center border`}
                style={{
                  backgroundColor: `${color}14`,
                  borderColor: `${sc}55`,
                  boxShadow: active ? `0 0 10px ${sc}44` : "none",
                }}
              >
                <Icon className={icon} style={{ color }} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ backgroundColor: sc, borderColor: "#0b0e14" }}
                />
              </div>
              {showLabels && (
                <span className={`text-[8.5px] text-slate-500 ${labelW} truncate text-center leading-tight`}>
                  {ne.node.name || ne.node.type}
                </span>
              )}
            </motion.div>
            {i < nodes.length - 1 && (
              <div className="w-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.14)", marginBottom: size === "sm" ? "12px" : "14px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
