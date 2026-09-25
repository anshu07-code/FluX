"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, CheckCircle2, Plus, Trash2, Settings, Zap, Key, Activity as ActivityIcon,
  RefreshCw, Search, Clock, Sparkles, TrendingUp, X, Filter, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { getActivity, getAllExecutions } from "@/lib/workflow-api";
import {
  ProcessMap, StatusBadge, execDuration, formatMs, timeAgo,
} from "@/components/process-map";

type ActivityEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

type ExecutionLike = Awaited<ReturnType<typeof getAllExecutions>>["executions"][number];

const ACTION_META: Record<string, {
  icon: LucideIcon;
  accent: string; label: string; group: string;
}> = {
  WORKFLOW_CREATE:   { icon: Plus,        accent: "#38bdf8", label: "Workflow Created",   group: "workflows" },
  WORKFLOW_RUN:      { icon: Play,        accent: "#a78bfa", label: "Workflow Executed",  group: "runs" },
  WORKFLOW_UPDATE:   { icon: Settings,    accent: "#fbbf24", label: "Workflow Updated",   group: "workflows" },
  WORKFLOW_DELETE:   { icon: Trash2,      accent: "#f87171", label: "Workflow Deleted",   group: "workflows" },
  WORKFLOW_ACTIVATE: { icon: Zap,         accent: "#34d399", label: "Workflow Activated", group: "workflows" },
  LOGIN:             { icon: CheckCircle2,accent: "#34d399", label: "Signed In",          group: "auth" },
  REGISTER:          { icon: Sparkles,    accent: "#38bdf8", label: "Account Created",    group: "auth" },
  OAUTH_LOGIN:       { icon: Key,         accent: "#38bdf8", label: "OAuth Login",        group: "auth" },
  PROFILE_UPDATE:    { icon: Settings,    accent: "#94a3b8", label: "Profile Updated",    group: "auth" },
  API_KEY_CREATE:    { icon: Key,         accent: "#fbbf24", label: "API Key Created",    group: "system" },
};
const FALLBACK_META = { icon: ActivityIcon, accent: "#94a3b8", label: "Activity", group: "system" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "runs", label: "Executions" },
  { id: "workflows", label: "Workflows" },
  { id: "auth", label: "Auth" },
  { id: "system", label: "System" },
];

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [executions, setExecutions] = useState<ExecutionLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const [a, e] = await Promise.all([getActivity(), getAllExecutions()]);
      setActivities(a.activities);
      setExecutions(e.executions);
    } catch {
      /* surfaced as empty state */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(false), 8000);
    return () => clearInterval(id);
  }, [load]);

  const execById = useMemo(() => {
    const m = new Map<string, ExecutionLike>();
    for (const ex of executions) m.set(ex.id, ex);
    return m;
  }, [executions]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      const meta = ACTION_META[a.action] ?? FALLBACK_META;
      if (filter !== "all" && meta.group !== filter) return false;
      if (query.trim()) {
        const name = (a.details?.name as string | undefined) ?? (a.details?.workflowName as string | undefined) ?? "";
        const hay = `${meta.label} ${name} ${a.action} ${a.resource}`.toLowerCase();
        if (!hay.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [activities, filter, query]);

  const stats = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    return {
      total: activities.length,
      today: activities.filter((a) => now - new Date(a.createdAt).getTime() < day).length,
      week: activities.filter((a) => now - new Date(a.createdAt).getTime() < day * 7).length,
      runs: activities.filter((a) => a.action === "WORKFLOW_RUN").length,
    };
  }, [activities]);

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
        <p className="text-sm text-slate-500 animate-pulse">Loading activity…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
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
              Activity
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              LIVE
            </span>
          </div>
          <p className="text-sm text-slate-500">Every event across your workspace, tracked in real time</p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh activity"
          className="btn-pill-sm btn-pill-icon group self-start sm:self-center shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
          <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </motion.div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Events", value: stats.total, icon: ActivityIcon, accent: "#38bdf8" },
          { label: "Last 24h", value: stats.today, icon: Clock, accent: "#34d399" },
          { label: "Last 7 days", value: stats.week, icon: TrendingUp, accent: "#a78bfa" },
          { label: "Executions", value: stats.runs, icon: Play, accent: "#fbbf24" },
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
                <s.icon className="w-4 h-4" style={{ color: s.accent }} />
              </div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="relative text-2xl font-bold text-white font-mono">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filter bar */}
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
            placeholder="Search events, workflows…"
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
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                filter === f.id
                  ? "text-white"
                  : "text-slate-400 hover:text-white"
              }`}
              style={filter === f.id
                ? { background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))", boxShadow: "0 3px 12px rgba(99,102,241,0.3)" }
                : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl py-16 text-center"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Search className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">No events match your filters</p>
          <p className="text-[11px] text-slate-600 mt-1">Try a different search or clear the filter</p>
        </motion.div>
      ) : (
        <div className="relative">
          {/* Timeline spine */}
          <div className="absolute left-[19px] top-4 bottom-4 w-px" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.02))" }} />
          <AnimatePresence mode="popLayout">
            {filtered.map((a, i) => {
              const meta = ACTION_META[a.action] ?? FALLBACK_META;
              const Icon = meta.icon;
              const name = (a.details?.name as string | undefined) ?? (a.details?.workflowName as string | undefined) ?? "";
              const isRun = a.action === "WORKFLOW_RUN";
              const exec = isRun && a.resourceId ? execById.get(a.resourceId) : undefined;
              const isOpen = expanded.has(a.id);
              const detailKeys = a.details ? Object.keys(a.details) : [];
              return (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), type: "spring", stiffness: 300, damping: 26 }}
                  className="relative pl-12 pb-3"
                >
                  {/* Timeline node */}
                  <div
                    className="absolute left-0 top-1 w-10 h-10 rounded-xl flex items-center justify-center z-10"
                    style={{ background: `${meta.accent}16`, border: `1px solid ${meta.accent}33`, boxShadow: `0 0 14px ${meta.accent}22` }}
                  >
                    <Icon className="w-[18px] h-[18px]" style={{ color: meta.accent }} />
                  </div>

                  <div
                    className="rounded-2xl p-4 transition-colors"
                    style={{ background: isOpen ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">{meta.label}</span>
                          {name && (
                            <span className="text-sm font-medium px-2 py-0.5 rounded-md text-flux-300 bg-flux-500/10 border border-flux-500/20 truncate max-w-[220px]">
                              {name}
                            </span>
                          )}
                          {isRun && exec && <StatusBadge status={exec.status} />}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(a.createdAt)}</span>
                          <span className="px-1.5 py-0.5 rounded text-slate-600 font-mono uppercase tracking-wide" style={{ background: "rgba(255,255,255,0.04)" }}>
                            {a.resource}
                          </span>
                          {isRun && exec && (
                            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{formatMs(execDuration(exec))}</span>
                          )}
                        </div>
                      </div>
                      {(isRun || detailKeys.length > 0) && (
                        <button
                          onClick={() => toggle(a.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all shrink-0"
                          style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                            {isRun && exec && (
                              <div className="mb-4">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2.5">Execution path · {exec.nodeExecutions.length} nodes</p>
                                <ProcessMap nodes={exec.nodeExecutions} size="sm" />
                                <Link
                                  href="/dashboard/executions"
                                  className="inline-flex items-center gap-1 mt-3 text-[10px] text-flux-400 hover:text-flux-300 transition-colors"
                                >
                                  View in executions <ArrowRight className="w-3 h-3" />
                                </Link>
                              </div>
                            )}
                            {detailKeys.length > 0 && (
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Details</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {detailKeys.map((k) => (
                                    <span
                                      key={k}
                                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono"
                                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                                    >
                                      <span className="text-slate-500">{k}</span>
                                      <span className="text-slate-300 max-w-[180px] truncate">{String(a.details?.[k] ?? "")}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
