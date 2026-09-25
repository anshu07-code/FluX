"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Clock, XCircle, Workflow, RefreshCw, Search, X, Zap,
  CheckCircle2, Pause, Archive, ArrowRight, Trash2, AlertTriangle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWorkflows, getAllExecutions, deleteWorkflow, type PersistedWorkflow } from "@/lib/workflow-api";
import { NODE_COLORS, timeAgo } from "@/components/process-map";

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  ACTIVE:   { label: "Active",   color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: CheckCircle2 },
  DRAFT:    { label: "Draft",    color: "#94a3b8", bg: "rgba(148,163,184,0.12)", icon: Pause },
  ARCHIVED: { label: "Archived", color: "#64748b", bg: "rgba(100,116,139,0.12)", icon: Archive },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "DRAFT", label: "Drafts" },
  { id: "ARCHIVED", label: "Archived" },
];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<PersistedWorkflow[]>([]);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<PersistedWorkflow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteWorkflow(deleteTarget.id);
      setWorkflows((ws) => ws.filter((w) => w.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  };

  const loadWorkflows = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const [wf, ex] = await Promise.all([listWorkflows(), getAllExecutions()]);
      setWorkflows(wf.workflows);
      const counts: Record<string, number> = {};
      for (const e of ex.executions) counts[e.workflow.id] = (counts[e.workflow.id] ?? 0) + 1;
      setRunCounts(counts);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows(false);
  }, [loadWorkflows]);

  const visible = useMemo(() => {
    return workflows.filter((w) => {
      if (filter !== "all" && w.status !== filter) return false;
      if (query.trim() && !w.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });
  }, [workflows, filter, query]);

  const stats = useMemo(() => ({
    total: workflows.length,
    active: workflows.filter((w) => w.status === "ACTIVE").length,
    runs: Object.values(runCounts).reduce((a, b) => a + b, 0),
  }), [workflows, runCounts]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl border-2 border-flux-500/20 border-t-flux-500 animate-spin" />
        <p className="text-sm text-slate-500 animate-pulse">Loading workflows…</p>
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
          <h1 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-1.5 bg-gradient-to-r from-white via-white to-slate-500 bg-clip-text text-transparent">
            Your Workflows
          </h1>
          <p className="text-sm text-slate-500">Design, build, and run automated workflows.</p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => void loadWorkflows(true)}
            disabled={refreshing}
            aria-label="Refresh workflows"
            className="btn-pill-ghost-sm btn-pill-icon sm:self-center shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <Link href="/workflows/builder">
            <Button>
              <Plus className="w-4 h-4" />
              New Workflow
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Workflows", short: "Total", value: stats.total, icon: Workflow, accent: "#38bdf8" },
          { label: "Active", short: "Active", value: stats.active, icon: Zap, accent: "#34d399" },
          { label: "Total Runs", short: "Runs", value: stats.runs, icon: ArrowRight, accent: "#a78bfa" },
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
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                <span className="sm:hidden">{s.short}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
            </div>
            <p className="relative text-2xl font-bold text-white font-mono">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-6 rounded-2xl text-center mb-6" style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.25)" }}>
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-300 text-sm">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void loadWorkflows()}>
            Try Again
          </Button>
        </div>
      )}

      {/* Search + filter */}
      {!error && workflows.length > 0 && (
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
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
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
        </motion.div>
      )}

      {/* Empty state */}
      {!error && workflows.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            <Workflow className="w-10 h-10 text-flux-400/70" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No workflows yet</h3>
          <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm">
            Create your first workflow to start automating tasks with a visual drag-and-drop editor.
          </p>
          <Link href="/workflows/builder">
            <Button>
              <Plus className="w-4 h-4" />
              Create Your First Workflow
            </Button>
          </Link>
        </motion.div>
      )}

      {/* No results */}
      {!error && workflows.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl py-16 text-center" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Search className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-medium">No workflows match your filters</p>
          <p className="text-[11px] text-slate-600 mt-1">Try a different search or clear the filter</p>
        </div>
      )}

      {/* Workflow grid */}
      {!error && visible.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {visible.map((workflow, index) => {
              const sm = STATUS_META[workflow.status] ?? STATUS_META.DRAFT;
              const runs = runCounts[workflow.id] ?? 0;
              const types = Array.from(new Set(workflow.nodes.map((n) => n.type))).slice(0, 6);
              return (
                <motion.div
                  key={workflow.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(index * 0.05, 0.3), type: "spring", stiffness: 300, damping: 26 }}
                >
                  <Link href={`/workflows/${workflow.id}`} className="block h-full group">
                    <div
                      className="relative overflow-hidden p-5 rounded-2xl h-full transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
                      }}
                    >
                      {/* Hover glow */}
                      <div
                        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-25 transition-opacity duration-500"
                        style={{ backgroundColor: sm.color }}
                      />

                      <div className="relative flex items-start justify-between mb-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors"
                          style={{ background: `${sm.color}14`, border: `1px solid ${sm.color}30` }}
                        >
                          <Workflow className="w-5 h-5" style={{ color: sm.color }} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9.5px] font-semibold uppercase tracking-wide"
                            style={{ color: sm.color, background: sm.bg }}
                          >
                            <sm.icon className="w-2.5 h-2.5" />
                            {sm.label}
                          </span>
                          <button
                            type="button"
                            aria-label={`Delete ${workflow.name}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteError("");
                              setDeleteTarget(workflow);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="relative text-[15px] font-semibold text-white mb-1 group-hover:text-flux-300 transition-colors truncate">
                        {workflow.name}
                      </h3>
                      <p className="relative text-[11px] text-slate-500">
                        {workflow.nodes.length} nodes · {workflow.edges.length} connection{workflow.edges.length !== 1 ? "s" : ""}
                      </p>

                      {/* Node type preview */}
                      {types.length > 0 && (
                        <div className="relative flex items-center gap-1 mt-3.5">
                          {types.map((t, ti) => {
                            const c = NODE_COLORS[t] ?? "#a78bfa";
                            return (
                              <span
                                key={ti}
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: c, opacity: 1 - ti * 0.12 }}
                                title={t}
                              />
                            );
                          })}
                          {workflow.nodes.length > types.length && (
                            <span className="text-[9px] text-slate-600 ml-1">+{workflow.nodes.length - types.length}</span>
                          )}
                        </div>
                      )}

                      <div
                        className="relative mt-4 pt-3.5 flex items-center justify-between"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {timeAgo(workflow.updatedAt)}
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <Zap className="w-3 h-3" />
                          {runs} run{runs !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-flux-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Delete confirmation */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete workflow"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-6 shadow-2xl shadow-black/60"
              style={{ background: "#11151f", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}
              >
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1.5">Delete workflow?</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                <span className="text-white font-medium">{deleteTarget.name}</span> and all of its
                executions will be permanently removed. This cannot be undone.
              </p>
              {deleteError && (
                <p className="mt-3 text-xs text-red-400" role="alert">{deleteError}</p>
              )}
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-white bg-red-500/90 border border-red-400/40 hover:bg-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
