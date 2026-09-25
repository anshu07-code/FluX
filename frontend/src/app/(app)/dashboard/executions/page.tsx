"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, RefreshCw, Search, Clock, X, Filter, ArrowRight, ChevronDown,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Timer, Zap,
} from "lucide-react";
import { getAllExecutions } from "@/lib/workflow-api";
import {
  ProcessMap, StatusBadge, execDuration, formatMs, timeAgo,
  NODE_COLORS, NODE_TYPE_ICONS, STATUS_COLORS,
} from "@/components/process-map";

type ExecutionData = Awaited<ReturnType<typeof getAllExecutions>>["executions"][number];

/* "Running" also matches PENDING — both count as in-progress work, and the
 * old "Waiting" chip matched nothing because executions never hold that
 * status. The dashboard donut deep-links here with ?status=<STATUS>. */
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "RUNNING", label: "Running" },
  { id: "SUCCESS", label: "Success" },
  { id: "FAILED", label: "Failed" },
];

const matchesFilter = (status: string, filter: string) =>
  filter === "all" ? true : filter === "RUNNING" ? status === "RUNNING" || status === "PENDING" : status === filter;

const SORTS = [
  { id: "recent", label: "Most recent" },
  { id: "oldest", label: "Oldest" },
  { id: "duration", label: "Longest running" },
  { id: "name", label: "Workflow A–Z" },
];

export default function ExecutionsPage() {
  // useSearchParams must sit under a Suspense boundary or Next prerender
  // bails out on the whole page.
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-2xl border-2 border-flux-500/20 border-t-flux-500 animate-spin" />
          <p className="text-sm text-slate-500 animate-pulse">Loading executions…</p>
        </div>
      }
    >
      <ExecutionsInner />
    </Suspense>
  );
}

function ExecutionsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [executions, setExecutions] = useState<ExecutionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);

  // Deep link from the dashboard donut: /dashboard/executions?status=SUCCESS
  const urlStatus = (searchParams.get("status") ?? "").toUpperCase();
  useEffect(() => {
    if (urlStatus === "SUCCESS" || urlStatus === "FAILED" || urlStatus === "RUNNING" || urlStatus === "PENDING") {
      setFilter(urlStatus === "PENDING" ? "RUNNING" : urlStatus);
    }
  }, [urlStatus]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await getAllExecutions();
      setExecutions(res.executions);
    } catch {
      /* surfaced as empty state */
    } finally {
      setLoading(false);
      if (isRefresh) {
        setTimeout(() => setRefreshing(false), 400);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(false), 5000);
    return () => clearInterval(id);
  }, [load]);

  const visible = useMemo(() => {
    const list = executions.filter((ex) => {
      if (!matchesFilter(ex.status, filter)) return false;
      if (query.trim() && !ex.workflow.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
    const cmp: Record<string, (a: ExecutionData, b: ExecutionData) => number> = {
      recent: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      oldest: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      duration: (a, b) => execDuration(b) - execDuration(a),
      name: (a, b) => a.workflow.name.localeCompare(b.workflow.name),
    };
    return list.sort(cmp[sort] ?? cmp.recent);
  }, [executions, filter, query, sort]);

  const stats = useMemo(() => ({
    total: executions.length,
    running: executions.filter((e) => e.status === "RUNNING" || e.status === "PENDING").length,
    success: executions.filter((e) => e.status === "SUCCESS").length,
    failed: executions.filter((e) => e.status === "FAILED").length,
  }), [executions]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl border-2 border-flux-500/20 border-t-flux-500 animate-spin" />
        <p className="text-sm text-slate-500 animate-pulse">Loading executions…</p>
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
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
              Executions
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <p className="text-sm text-slate-500">Every workflow instance with its full node-by-node process map</p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh executions"
          className="btn-pill-sm btn-pill-icon group self-start sm:self-center shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </motion.div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Runs", value: stats.total, icon: Play, accent: "#38bdf8" },
          { label: "In Progress", value: stats.running, icon: stats.running > 0 ? Loader2 : Timer, accent: "#38bdf8", spin: stats.running > 0 },
          { label: "Succeeded", value: stats.success, icon: CheckCircle2, accent: "#34d399" },
          { label: "Failed", value: stats.failed, icon: XCircle, accent: "#f87171" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.06, duration: 0.45 }}
            className="relative overflow-hidden rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-15" style={{ backgroundColor: s.accent }} />
            <div className="relative flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.accent}1a`, border: `1px solid ${s.accent}33` }}>
                        <s.icon className={`w-4 h-4 ${s.spin ? "animate-spin" : ""}`} style={{ color: s.accent }} />
              </div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="relative text-2xl font-bold text-white font-mono">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filter + sort bar */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5"
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows…"
            className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none transition-colors focus:border-flux-500/50"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-slate-600 shrink-0 mr-1" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                // Keep the URL in sync so donut deep-links and chip clicks
                // can't drift apart (and back/forward behave predictably).
                router.replace(
                  f.id === "all" ? "/dashboard/executions" : `/dashboard/executions?status=${f.id}`,
                  { scroll: false },
                );
              }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filter === f.id ? "text-white" : "text-slate-400 hover:text-white"
              }`}
              style={filter === f.id
                ? { background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))", boxShadow: "0 3px 12px rgba(99,102,241,0.3)" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="text-slate-600">Sort</span>
            <span className="text-white">{SORTS.find((s) => s.id === sort)?.label}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {sortOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="absolute right-0 top-full mt-2 z-50 w-48 rounded-xl overflow-hidden shadow-2xl shadow-black/50"
                style={{ background: "#131722", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSort(s.id); setSortOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-medium transition-colors hover:bg-white/5"
                    style={{ color: sort === s.id ? "#a5b4fc" : "#cbd5e1" }}
                  >
                    {s.label}
                    {sort === s.id && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {visible.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl py-16 text-center"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Play className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">No executions found</p>
          <p className="text-[11px] text-slate-600 mt-1">
            {executions.length === 0 ? "Run a workflow to see its process map here" : "Try adjusting your filters"}
          </p>
          {executions.length === 0 && (
            <Link href="/workflows" className="inline-flex items-center gap-1.5 mt-4 text-xs text-flux-400 hover:text-flux-300 transition-colors">
              Go to workflows <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {visible.map((ex, i) => {
              const isOpen = expanded.has(ex.id);
              const dur = execDuration(ex);
              const sc = STATUS_COLORS[ex.status] ?? "#64748b";
              const hasError = ex.status === "FAILED" && ex.error;
              const done = ex.nodeExecutions.filter((n) => n.status === "SUCCESS").length;
              const pct = ex.nodeExecutions.length > 0 ? Math.round((done / ex.nodeExecutions.length) * 100) : 0;
              return (
                <motion.div
                  key={ex.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), type: "spring", stiffness: 300, damping: 26 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${hasError ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.08)"}` }}
                >
                  {/* Row header */}
                  <button onClick={() => toggle(ex.id)} className="w-full text-left p-4 transition-colors hover:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StatusBadge status={ex.status} />
                        <Link
                          href={`/workflows/${ex.workflow.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-white font-medium truncate hover:text-flux-300 transition-colors"
                        >
                          {ex.workflow.name}
                        </Link>
                        <ChevronDown
                          className="w-4 h-4 text-slate-600 transition-transform shrink-0"
                          style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatMs(dur)}</span>
                        <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{timeAgo(ex.createdAt)}</span>
                        <span className="font-mono">{done}/{ex.nodeExecutions.length} nodes</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 rounded-full overflow-hidden mb-3.5" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ex.status === "RUNNING" ? Math.max(pct, 8) : pct}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: sc, boxShadow: `0 0 8px ${sc}66` }}
                      />
                    </div>

                    {/* Live process map */}
                    <ProcessMap nodes={ex.nodeExecutions} size="sm" showLabels={false} />
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          {hasError && (
                            <div
                              className="flex items-start gap-2.5 rounded-xl p-3 mb-3 mt-3"
                              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}
                            >
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-red-400 mb-0.5">Execution failed</p>
                                <p className="text-[10px] text-red-300/80 font-mono break-all">{ex.error}</p>
                              </div>
                            </div>
                          )}

                          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mt-3 mb-2.5">
                            Node timeline · {ex.nodeExecutions.length} steps
                          </p>
                          <div className="space-y-2">
                            {ex.nodeExecutions.map((ne, ni) => {
                              const color = NODE_COLORS[ne.node.type] ?? "#a78bfa";
                              const nsc = STATUS_COLORS[ne.status] ?? "#64748b";
                              const NIcon = NODE_TYPE_ICONS[ne.node.type] ?? Zap;
                              const nDur = ne.startedAt && ne.completedAt
                                ? new Date(ne.completedAt).getTime() - new Date(ne.startedAt).getTime()
                                : 0;
                              return (
                                <motion.div
                                  key={ne.id}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: ni * 0.04 }}
                                  className="flex items-center gap-3 rounded-lg p-2.5"
                                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                                >
                                  <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
                                    style={{ background: `${color}14`, border: `1px solid ${nsc}44` }}
                                  >
                                    <NIcon className="w-3.5 h-3.5" style={{ color }} />
                                    <span
                                      className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2"
                                      style={{ backgroundColor: nsc, borderColor: "#0b0e14" }}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[12px] text-white font-medium truncate">{ne.node.name || ne.node.type}</p>
                                    <p className="text-[9.5px] text-slate-600 font-mono uppercase tracking-wide">{ne.node.type}</p>
                                  </div>
                                  {ne.error && (
                                    <span className="text-[10px] text-red-400/80 font-mono truncate max-w-[180px]" title={ne.error}>
                                      {ne.error}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                    {ne.status === "RUNNING" ? "running…" : nDur > 0 ? formatMs(nDur) : "—"}
                                  </span>
                                  <span
                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
                                    style={{ color: nsc, background: `${nsc}14` }}
                                  >
                                    {ne.status}
                                  </span>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
