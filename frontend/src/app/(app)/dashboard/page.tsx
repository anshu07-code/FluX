"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Workflow, Play, Plus, ArrowRight, Clock, XCircle, Activity as ActivityIcon,
  TrendingUp, Loader2, Cpu, RefreshCw, Zap, CheckCircle2, AlertTriangle,
  GitBranch, Sparkles, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listWorkflows, getDashboardStats, getActivity, getSystemStatus,
  getAllExecutions, type PersistedWorkflow,
} from "@/lib/workflow-api";
import { ProcessMap, STATUS_COLORS, STATUS_BG, timeAgo } from "@/components/process-map";

/* ─── Utilities ─────────────────────────────────────────────────────────── */

function formatMs(ms: number): string {
  if (!isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function execDuration(ex: { startedAt: string | null; completedAt: string | null }): number {
  if (!ex.startedAt) return 0;
  const end = ex.completedAt ? new Date(ex.completedAt).getTime() : Date.now();
  return end - new Date(ex.startedAt).getTime();
}

/* Node/status palettes live in @/components/process-map (imported above) so
 * every ProcessMap render across the app shares one source of truth. */

/* ─── Donut chart (SVG) ─────────────────────────────────────────────────── */

type DonutSegment = { value: number; color: string; label: string; status?: string };

function Donut({ segments, size = 132, hovered, onHover, onSelect }: {
  segments: DonutSegment[];
  size?: number;
  hovered: string | null;
  onHover: (label: string | null) => void;
  onSelect: (seg: DonutSegment) => void;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const activeSeg = segments.find((s) => s.label === hovered);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {total > 0 && segments.filter((s) => s.value > 0).map((seg, i) => {
          const len = (seg.value / total) * circ;
          const isHover = hovered === seg.label;
          const el = (
            <motion.circle
              key={i}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={seg.color} strokeLinecap="round"
              strokeDasharray={`${len} ${circ - len}`}
              initial={{ strokeDasharray: `0 ${circ}` }}
              animate={{ strokeDasharray: `${len} ${circ - len}` }}
              transition={{ duration: 0.9, delay: 0.15 * i, ease: [0.22, 1, 0.36, 1] }}
              style={{
                strokeDashoffset: -offset,
                strokeWidth: isHover ? stroke + 5 : stroke,
                transition: "stroke-width 180ms ease, opacity 180ms ease",
                opacity: hovered && !isHover ? 0.45 : 1,
                cursor: "pointer",
              }}
              onMouseEnter={() => onHover(seg.label)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(seg)}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {activeSeg ? (
          <>
            <span className="text-2xl font-bold font-mono" style={{ color: activeSeg.color }}>{activeSeg.value}</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-400">{activeSeg.label}</span>
          </>
        ) : (
          <>
            <span className="text-2xl font-bold text-white font-mono">{total}</span>
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Total</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Sparkline (recent executions trend) ───────────────────────────────── */

function Sparkline({ data, color = "#38bdf8", width = 260, height = 56 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => [i * step, height - (v / max) * (height - 8) - 4]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <motion.path
        d={area} fill="url(#spark-grad)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }}
      />
      <motion.path
        d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={color} opacity={i === pts.length - 1 ? 1 : 0.45} />
      ))}
    </svg>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, accent, delay }: {
  label: string; value: number; sub?: string;
  icon: LucideIcon; accent: string; delay: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevValueRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    if (from === to) return;
    const dur = 600;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      // Track the ref WITH the displayed value — never pre-assign the target.
      // React StrictMode (dev) runs effect → cleanup → effect: a pre-assigned
      // ref made the second run see from === to, bail out, and leave the card
      // pinned at 0 forever while the cancelled frame never rendered.
      prevValueRef.current = v;
      setDisplay(v);
      if (p < 1) animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl p-5 group"
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div
        className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-2xl opacity-20 transition-opacity group-hover:opacity-40"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-center gap-3 mb-3.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}1a`, border: `1px solid ${accent}33` }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color: accent }} />
        </div>
        <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <span className="text-[34px] leading-none font-bold text-white font-mono tracking-tight">{display}</span>
        {sub && <span className="text-xs text-slate-500 font-medium">{sub}</span>}
      </div>
    </motion.div>
  );
}

/* ─── System health pill ────────────────────────────────────────────────── */

function HealthPill({ label, ok, status }: { label: string; ok: boolean; status: string }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
      style={{ background: ok ? "rgba(52,211,153,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${ok ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)"}` }}
    >
      <span className={`relative flex w-2 h-2 ${ok ? "" : ""}`}>
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${ok ? "bg-emerald-400" : "bg-red-400"}`} />
      </span>
      <span className="text-xs text-slate-200 font-medium">{label}</span>
      <span className={`text-[10px] ml-auto font-semibold uppercase tracking-wide ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {status}
      </span>
    </div>
  );
}

/* ─── Activity action meta ──────────────────────────────────────────────── */

const ACTION_META: Record<string, { icon: LucideIcon; accent: string; label: string }> = {
  WORKFLOW_CREATE: { icon: Plus, accent: "#38bdf8", label: "Created workflow" },
  WORKFLOW_RUN: { icon: Play, accent: "#a78bfa", label: "Ran workflow" },
  WORKFLOW_UPDATE: { icon: RefreshCw, accent: "#fbbf24", label: "Updated workflow" },
  WORKFLOW_DELETE: { icon: XCircle, accent: "#f87171", label: "Deleted workflow" },
  WORKFLOW_ACTIVATE: { icon: Zap, accent: "#34d399", label: "Activated workflow" },
  LOGIN: { icon: CheckCircle2, accent: "#34d399", label: "Signed in" },
  REGISTER: { icon: Sparkles, accent: "#38bdf8", label: "Created account" },
  API_KEY_CREATE: { icon: Zap, accent: "#fbbf24", label: "Created API key" },
};

const FALLBACK_META = { icon: ActivityIcon, accent: "#94a3b8", label: "Activity" };

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null);
  const [workflows, setWorkflows] = useState<PersistedWorkflow[]>([]);
  const [activities, setActivities] = useState<Awaited<ReturnType<typeof getActivity>>["activities"]>([]);
  const [executions, setExecutions] = useState<Awaited<ReturnType<typeof getAllExecutions>>["executions"]>([]);
  const [services, setServices] = useState<Awaited<ReturnType<typeof getSystemStatus>>["services"]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredSeg, setHoveredSeg] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const results = await Promise.allSettled([
        getDashboardStats(), listWorkflows(), getActivity(), getAllExecutions(), getSystemStatus(),
      ]);
      const [s, w, a, e, sys] = results;
      if (s.status === "fulfilled") {
        setStats(s.value);
      } else if (w.status === "fulfilled" || e.status === "fulfilled") {
        // Stats failed but other sources arrived — derive the cards from them
        // instead of rendering zeros.
        const list = w.status === "fulfilled" ? w.value.workflows : [];
        const execs = e.status === "fulfilled" ? e.value.executions : [];
        const successCount = execs.filter((x) => x.status === "SUCCESS").length;
        const failedCount = execs.filter((x) => x.status === "FAILED").length;
        const runningCount = execs.filter((x) => x.status === "RUNNING" || x.status === "PENDING").length;
        setStats({
          totalWorkflows: list.length,
          totalExecutions: execs.length,
          successRate: execs.length > 0 ? Math.round((successCount / execs.length) * 100) : 0,
          successCount,
          failedCount,
          runningCount,
          recentExecutions: execs.slice(0, 5).map((x) => ({
            id: x.id,
            status: x.status,
            createdAt: x.createdAt,
            workflow: { name: x.workflow.name },
          })),
        });
      }
      if (w.status === "fulfilled") setWorkflows(w.value.workflows);
      if (a.status === "fulfilled") setActivities(a.value.activities);
      if (e.status === "fulfilled") setExecutions(e.value.executions);
      if (sys.status === "fulfilled") setServices(sys.value.services);

      // A single failed call used to render zeros with no indication anything
      // was wrong (the banner only appeared when everything failed). Name what
      // didn't load so a partial failure is always visible.
      const labels = ["stats", "workflows", "activity", "executions", "system status"];
      const failedLabels = results.flatMap((r, i) => (r.status === "rejected" ? [labels[i]] : []));
      const fulfilled = results.length - failedLabels.length;
      if (fulfilled === 0) {
        const first = results[0] as PromiseRejectedResult;
        const reason = first?.reason;
        setLoadError(reason instanceof Error ? reason.message : "Could not reach the FluX API.");
      } else if (failedLabels.length > 0) {
        setLoadError(`Could not load ${failedLabels.join(", ")} — retrying automatically.`);
      } else {
        setLoadError(null);
      }
      setLastUpdated(new Date());
    } catch {
      /* individual failures are handled by allSettled */
    } finally {
      setLoading(false);
      if (isRefresh) {
        // minimum visible refresh state to avoid flicker
        setTimeout(() => setRefreshing(false), 400);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(false), 10000);
    return () => clearInterval(id);
  }, [load]);

  /* Time range for execution activity graph */
  const [timeRange, setTimeRange] = useState<"hour" | "day" | "week" | "month" | "year">("hour");

  const RANGE_CONFIG = {
    hour:  { buckets: 12, label: "last 12h",        bucketMs: 300000,  startLabel: "1h ago",    endLabel: "now" },
    day:   { buckets: 24, label: "last 24h",        bucketMs: 3600000, startLabel: "24h ago",   endLabel: "now" },
    week:  { buckets: 7,  label: "last 7 days",     bucketMs: 86400000,startLabel: "7d ago",    endLabel: "today" },
    month: { buckets: 30, label: "last 30 days",    bucketMs: 86400000,startLabel: "30d ago",   endLabel: "today" },
    year:  { buckets: 12, label: "last 12 months",  bucketMs: 2629800000, startLabel: "12mo ago", endLabel: "this month" },
  } as const;

  const rangeCfg = RANGE_CONFIG[timeRange];

  /* Bucket executions for the sparkline based on selected range */
  const trend = useMemo(() => {
    const buckets = new Array(rangeCfg.buckets).fill(0);
    const now = Date.now();
    for (const ex of executions) {
      const t = new Date(ex.createdAt).getTime();
      const idx = rangeCfg.buckets - 1 - Math.floor((now - t) / rangeCfg.bucketMs);
      if (idx >= 0 && idx < rangeCfg.buckets) buckets[idx] += 1;
    }
    return buckets;
  }, [executions, rangeCfg]);

  const activeWorkflows = useMemo(() => workflows.filter((w) => w.status === "ACTIVE"), [workflows]);
  const recentExecutions = executions.slice(0, 5);
  const successRate = stats ? Math.round(stats.successRate) : 0;
  const runningNow = stats?.runningCount ?? 0;
  const donutSegments = useMemo(() => [
    { value: stats?.successCount ?? 0, color: "#34d399", label: "Success", status: "SUCCESS" },
    { value: stats?.failedCount ?? 0, color: "#f87171", label: "Failed", status: "FAILED" },
    { value: runningNow, color: "#38bdf8", label: "Running", status: "RUNNING" },
  ], [stats, runningNow]);
  const totalDones = donutSegments.reduce((s, x) => s + x.value, 0);
  const todayActivities = activities.filter(
    (a) => Date.now() - new Date(a.createdAt).getTime() < 86400000,
  ).length;

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl border-2 border-flux-500/20 border-t-flux-500 animate-spin" />
        </div>
        <p className="text-sm text-slate-500 animate-pulse">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Real-time automation overview · updated {lastUpdated ? timeAgo(lastUpdated.toISOString()) : "—"}
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh dashboard"
          className="btn-pill-sm btn-pill-icon group self-start sm:self-center shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </motion.div>

      {/* Load error banner — a silent failure previously rendered as all-zero cards */}
      {loadError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}
        >
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-red-300">
            <span className="font-semibold">Dashboard data unavailable: </span>
            {loadError}
          </div>
          <button
            onClick={() => void load(true)}
            className="text-[11px] font-semibold text-red-300 hover:text-white transition-colors"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Workflows" value={stats?.totalWorkflows ?? 0} icon={Workflow} accent="#38bdf8" delay={0.05} sub={`${activeWorkflows.length} active`} />
        <StatCard label="Executions" value={stats?.totalExecutions ?? 0} icon={Play} accent="#a78bfa" delay={0.12} sub="all time" />
        <StatCard label="Success Rate" value={successRate} icon={CheckCircle2} accent="#34d399" delay={0.19} sub={successRate >= 90 ? "healthy" : "needs attention"} />
        <StatCard label="Running Now" value={runningNow} icon={runningNow > 0 ? Loader2 : Zap} accent="#fbbf24" delay={0.26} sub={runningNow > 0 ? "in progress" : "idle"} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Status distribution donut */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="lg:col-span-4 rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-500" /> Outcome Distribution
          </h3>
          <div className="flex items-center gap-5">
            <Donut
              segments={donutSegments}
              hovered={hoveredSeg}
              onHover={setHoveredSeg}
              onSelect={(seg) => seg.status && router.push(`/dashboard/executions?status=${seg.status}`)}
            />
            <div className="flex-1 space-y-1">
              {donutSegments.map((seg) => {
                const pct = totalDones > 0 ? Math.round((seg.value / totalDones) * 100) : 0;
                const isHover = hoveredSeg === seg.label;
                return (
                  <button
                    key={seg.label}
                    disabled={!seg.status || seg.value === 0}
                    onMouseEnter={() => setHoveredSeg(seg.label)}
                    onMouseLeave={() => setHoveredSeg(null)}
                    onFocus={() => setHoveredSeg(seg.label)}
                    onBlur={() => setHoveredSeg(null)}
                    onClick={() => seg.status && router.push(`/dashboard/executions?status=${seg.status}`)}
                    title={seg.status ? `View ${seg.label} executions` : undefined}
                    className={`w-full flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg transition-colors text-left ${
                      isHover ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                    } ${seg.value === 0 ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                      {seg.label}
                    </span>
                    <span className="flex items-center gap-2.5 font-mono text-slate-400">
                      {seg.value}
                      <span className="text-slate-600 w-8 text-right">{totalDones > 0 ? `${pct}%` : "—"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Trend sparkline */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.37, duration: 0.5 }}
          className="lg:col-span-5 rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" /> Execution Activity
            </h3>
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(["hour", "day", "week", "month", "year"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wide transition-all ${
                    timeRange === r ? "text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                  style={timeRange === r
                    ? { background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))" }
                    : {}}
                >
                  {r === "hour" ? "1H" : r === "day" ? "1D" : r === "week" ? "1W" : r === "month" ? "1M" : "1Y"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mb-3">Executions · {rangeCfg.label}</p>
          <div className="flex items-end h-[64px]">
            <Sparkline data={trend} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-600">
            <span>{rangeCfg.startLabel}</span>
            <span className="text-slate-400 font-medium">{trend.reduce((a, b) => a + b, 0)} total</span>
            <span>{rangeCfg.endLabel}</span>
          </div>
        </motion.div>

        {/* System health */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44, duration: 0.5 }}
          className="lg:col-span-3 rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-500" /> System Health
          </h3>
          <div className="space-y-2">
            {services.length === 0 && <p className="text-[11px] text-slate-600">Status unavailable</p>}
            {services.map((svc, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.06 }}>
                <HealthPill label={svc.label} ok={svc.ok} status={svc.status} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Live executions with process maps */}
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="rounded-2xl p-5 mb-6"
        style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ActivityIcon className="w-4 h-4 text-slate-500" /> Live Execution Paths
          </h3>
          <Link href="/dashboard/executions" className="text-[11px] text-flux-400 hover:text-flux-300 flex items-center gap-1 transition-colors">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recentExecutions.length === 0 ? (
          <div className="py-10 text-center">
            <Play className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No executions yet</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Run a workflow to see its live process map here</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {recentExecutions.map((ex, i) => {
                const sc = STATUS_COLORS[ex.status] ?? "#64748b";
                const badge = STATUS_BG[ex.status] ?? STATUS_BG.PENDING;
                const dur = execDuration(ex);
                return (
                  <motion.div
                    key={ex.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 26 }}
                    className="rounded-xl p-4"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `2px solid ${sc}` }}
                  >
                    <div className="flex items-center justify-between mb-3.5 gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge}`}>
                          {ex.status === "RUNNING" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          {ex.status}
                        </span>
                        <span className="text-sm text-white font-medium truncate">{ex.workflow.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatMs(dur)}</span>
                        <span>{timeAgo(ex.createdAt)}</span>
                      </div>
                    </div>
                    <ProcessMap nodes={ex.nodeExecutions} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Bottom row: workflows + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Workflows */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.56, duration: 0.5 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Workflow className="w-4 h-4 text-slate-500" /> Your Workflows
            </h3>
            <Link href="/workflows" className="text-[11px] text-flux-400 hover:text-flux-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {workflows.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No workflows yet</p>
              <Link href="/workflows/builder">
                <Button className="mt-3 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Create your first workflow
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {workflows.slice(0, 5).map((w, i) => (
                <motion.div key={w.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.05 }}>
                  <Link
                    href={`/workflows/${w.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-white/[0.04] group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: w.status === "ACTIVE" ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.05)" }}
                    >
                      <Workflow className="w-4 h-4" style={{ color: w.status === "ACTIVE" ? "#34d399" : "#94a3b8" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate group-hover:text-flux-300 transition-colors">{w.name}</p>
                      <p className="text-[10px] text-slate-600">{w.nodes.length} nodes · updated {timeAgo(w.updatedAt)}</p>
                    </div>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
                      style={{
                        color: w.status === "ACTIVE" ? "#34d399" : "#94a3b8",
                        background: w.status === "ACTIVE" ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      {w.status}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Activity feed */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.63, duration: 0.5 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-slate-500" /> Recent Activity
            </h3>
            <Link href="/dashboard/activity" className="text-[11px] text-flux-400 hover:text-flux-300 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex-1">
              <p className="text-2xl font-bold text-white font-mono">{todayActivities}</p>
              <p className="text-[10px] text-slate-500">events in the last 24h</p>
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-white font-mono">{activities.length}</p>
              <p className="text-[10px] text-slate-500">total events</p>
            </div>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No activity yet</p>
          ) : (
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {activities.slice(0, 8).map((a, i) => {
                const meta = ACTION_META[a.action] ?? FALLBACK_META;
                const Icon = meta.icon;
                const name = (a.details?.name as string | undefined) ?? (a.details?.workflowName as string | undefined) ?? "";
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.66 + i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: `${meta.accent}14`, border: `1px solid ${meta.accent}28` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: meta.accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-slate-200 leading-snug">
                        {meta.label}
                        {name && <span className="text-white font-medium"> · {name}</span>}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{timeAgo(a.createdAt)}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

