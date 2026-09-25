"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, Play, Plus, Loader2, ChevronLeft, ChevronDown,
  Search, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  PanelRightOpen, Workflow, X, MousePointerClick, FileCode, Trash2,
  Globe, Copy
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkflowNode } from "./workflow-node";
import { NodeConfigPanel } from "./node-config-panel";
import {
  nodeCatalog,
  nodeCategories,
  workflowNodeTypes,
  type WorkflowEdge,
  type WorkflowNode as WorkflowGraphNode,
  type WorkflowNodeData,
  type WorkflowNodeType,
} from "./workflow-types";
import { useWorkflowStore } from "@/store/workflow-store";
import { WorkflowThemeProvider, useWorkflowTheme, themes } from "@/lib/workflow-themes";
import { defaultNodeConfig } from "@/lib/template-defaults";
import { allTemplates, categories, subcategories, type BuilderTemplate } from "@/lib/templates-data";
import {
  getExecution,
  getWorkflow,
  listWorkflows,
  runWorkflow,
  saveNewWorkflow,
  toCanvasGraph,
  updateExistingWorkflow,
  updateWorkflowStatus,
  getWebhookUrl,
  type PersistedExecution,
  type PersistedWorkflow,
  type WorkflowPayload,
} from "@/lib/workflow-api";
import { LaunchSequence } from "./launch-sequence";
import { AnalysisPanel } from "./analysis-panel";
import { FluxLogoMark } from "@/components/flux-logo";

const dragMimeType = "application/flux-node";

const TOAST_ICONS = {
  success: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6L6 10M6 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 shrink-0">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="5" r="0.75" fill="currentColor" />
      <path d="M8 7.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

const TOAST_STYLES = {
  success: {
    bg: "bg-black/80",
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/10",
    icon: "text-emerald-400",
    text: "text-white",
    progress: "bg-emerald-500/60",
  },
  error: {
    bg: "bg-black/80",
    border: "border-red-500/40",
    glow: "shadow-red-500/10",
    icon: "text-red-400",
    text: "text-white",
    progress: "bg-red-500/60",
  },
  info: {
    bg: "bg-black/80",
    border: "border-flux-500/40",
    glow: "shadow-flux-500/10",
    icon: "text-flux-400",
    text: "text-white",
    progress: "bg-flux-500/60",
  },
};

function ToastContainer() {
  const { toasts, dismissToast } = useWorkflowStore();

  return (
    <div className="fixed top-5 right-5 z-[200] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const s = TOAST_STYLES[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.92, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.88, filter: "blur(4px)", transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={() => dismissToast(toast.id)}
              className={`pointer-events-auto relative flex flex-col gap-3 px-4 py-3 rounded-2xl border backdrop-blur-2xl shadow-2xl shadow-black/50 cursor-pointer overflow-hidden min-w-72 max-w-96 ${s.bg} ${s.border}`}
              style={{ boxShadow: `0 8px 32px -4px var(--tw-shadow-color), 0 2px 8px -2px var(--tw-shadow-color)` }}
            >
              {/* Inner glow border */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ background: `linear-gradient(135deg, currentColor 0%, transparent 50%)`, opacity: 0.04 }}
              />

              <div className="relative flex items-start gap-3">
                {/* Icon */}
                <div className={`mt-0.5 shrink-0 ${s.icon}`}>
                  {TOAST_ICONS[toast.type]}
                </div>

                {/* Text */}
                <p className={`text-sm font-medium leading-snug flex-1 ${s.text}`}>
                  {toast.text}
                </p>

                {/* Dismiss X */}
                <button
                  onClick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
                  className="mt-0.5 p-0.5 rounded-md text-white/40 hover:text-white/80 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress bar */}
              <div className="relative h-0.5 w-full rounded-full overflow-hidden">
                <motion.div
                  key={toast.id}
                  initial={{ scaleX: 1, transformOrigin: "left" }}
                  animate={{ scaleX: 0, transformOrigin: "left" }}
                  transition={{ duration: (toast.duration ?? 3500) / 1000, ease: "linear" }}
                  className={`h-full rounded-full ${s.progress}`}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useWorkflowTheme();
  const [open, setOpen] = useState(false);
  const ThemeIcon = theme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-colors hover:opacity-80"
        style={{ borderColor: theme.sidebarBorder, color: theme.nodeSubtext }}
        title="Change theme"
      >
        <ThemeIcon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium hidden sm:inline">{theme.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full right-0 mt-1 w-56 rounded-xl border shadow-2xl shadow-black/40 z-50 overflow-hidden"
              style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
            >
              {themes.map((t) => {
                const TIcon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-all"
                    style={{
                      color: t.id === theme.id ? t.accent : theme.nodeText,
                      backgroundColor: t.id === theme.id ? t.accentLight : "transparent",
                    }}
                  >
                    <TIcon className="w-4 h-4 shrink-0" style={{ color: t.accent }} />
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-auto flex gap-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.nodeColors.trigger }} />
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.nodeColors.http }} />
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.nodeColors.ai }} />
                    </span>
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NewWorkflowDropdown({ onFromTemplate }: { onFromTemplate: () => void }) {
  const { theme } = useWorkflowTheme();
  const { newWorkflow } = useWorkflowStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors border"
        style={{ color: theme.nodeSubtext, borderColor: theme.sidebarBorder }}
      >
        <Plus className="w-3 h-3" /> New
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full right-0 mt-1 w-48 rounded-xl border shadow-2xl shadow-black/40 z-50 overflow-hidden"
              style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
            >
              <button
                onClick={() => { newWorkflow(); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-sm transition-colors hover:opacity-80"
                style={{ color: theme.nodeText }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}` }}>
                  <Plus className="w-3.5 h-3.5" style={{ color: theme.nodeSubtext }} />
                </div>
                <div>
                  <p className="font-medium text-xs">Blank</p>
                  <p className="text-[10px]" style={{ color: theme.nodeSubtext }}>Start from scratch</p>
                </div>
              </button>
              <div className="h-px mx-3" style={{ backgroundColor: theme.sidebarBorder }} />
              <button
                onClick={() => { onFromTemplate(); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-sm transition-colors hover:opacity-80"
                style={{ color: theme.nodeText }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.accentLight, border: `1px solid ${theme.accent}33` }}>
                  <FileCode className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                </div>
                <div>
                  <p className="font-medium text-xs">From Template</p>
                  <p className="text-[10px]" style={{ color: theme.nodeSubtext }}>Choose a pre-built template</p>
                </div>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyConfigPanel() {
  const { theme } = useWorkflowTheme();
  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="w-[320px] border-l flex flex-col shrink-0 h-full items-center justify-center max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-40 max-sm:w-[min(320px,88vw)] max-sm:shadow-[-8px_0_28px_rgba(0,0,0,0.55)]"
      style={{ borderColor: theme.sidebarBorder, backgroundColor: theme.configPanelBg }}
    >
      <MousePointerClick className="w-10 h-10 mb-3" style={{ color: theme.nodeSubtext }} />
      <p className="text-sm font-medium" style={{ color: theme.nodeText }}>Select a node</p>
      <p className="text-xs mt-1" style={{ color: theme.nodeSubtext }}>Click a node to configure it</p>
    </motion.aside>
  );
}

function SidebarContent({
  search,
  setSearch,
  collapsed,
}: {
  search: string;
  setSearch: (s: string) => void;
  collapsed: boolean;
}) {
  const { theme } = useWorkflowTheme();
  const filtered = search
    ? workflowNodeTypes.filter(
        (t) =>
          nodeCatalog[t].label.toLowerCase().includes(search.toLowerCase()) ||
          nodeCatalog[t].description.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  if (collapsed) {
    const nodeColorMap: Record<string, { color: string; bg: string }> = {
      trigger: { color: theme.nodeColors.trigger, bg: theme.nodeColors.triggerBg },
      http: { color: theme.nodeColors.http, bg: theme.nodeColors.httpBg },
      ai: { color: theme.nodeColors.ai, bg: theme.nodeColors.aiBg },
      condition: { color: theme.nodeColors.condition, bg: theme.nodeColors.conditionBg },
      email: { color: theme.nodeColors.email, bg: theme.nodeColors.emailBg },
      database: { color: theme.nodeColors.database, bg: theme.nodeColors.databaseBg },
      code: { color: theme.nodeColors.code, bg: theme.nodeColors.codeBg },
      webhook: { color: theme.nodeColors.webhook, bg: theme.nodeColors.webhookBg },
      delay: { color: theme.nodeColors.delay, bg: theme.nodeColors.delayBg },
      set: { color: theme.nodeColors.set, bg: theme.nodeColors.setBg },
      switch: { color: theme.nodeColors.switch, bg: theme.nodeColors.switchBg },
      merge: { color: theme.nodeColors.merge, bg: theme.nodeColors.mergeBg },
      split: { color: theme.nodeColors.split, bg: theme.nodeColors.splitBg },
      error: { color: theme.nodeColors.error, bg: theme.nodeColors.errorBg },
    auth: { color: theme.nodeColors.auth, bg: theme.nodeColors.authBg },
    document: { color: theme.nodeColors.document, bg: theme.nodeColors.documentBg },
    filter: { color: theme.nodeColors.filter, bg: theme.nodeColors.filterBg },
    approval: { color: theme.nodeColors.approval, bg: theme.nodeColors.approvalBg },
    idempotency: { color: theme.nodeColors.idempotency, bg: theme.nodeColors.idempotencyBg },
  };
    return (
      <div className="flex flex-col items-center gap-2 pt-2 overflow-y-auto flex-1 min-h-0">
        {workflowNodeTypes.map((type) => {
          const item = nodeCatalog[type];
          const Icon = item.icon;
          const nc = nodeColorMap[type] ?? { color: theme.accent, bg: theme.accentLight };
          return (
            <button
              key={type}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(dragMimeType, type);
                event.dataTransfer.effectAllowed = "move";
              }}
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all group cursor-grab active:cursor-grabbing"
              style={{ backgroundColor: nc.bg, border: `1px solid ${nc.color}33` }}
              title={item.label}
            >
              <span style={{ color: nc.color }}><Icon className="w-4 h-4 group-hover:scale-110 transition-transform" /></span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: theme.nodeSubtext }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg placeholder-slate-500 focus:outline-none transition-colors"
            style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:opacity-80">
              <X className="w-3 h-3" style={{ color: theme.nodeSubtext }} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto">
        {filtered ? (
          <div className="space-y-1.5">
            {filtered.map((type) => {
              const item = nodeCatalog[type];
              const Icon = item.icon;
              return <NodeDragButton key={type} type={type} item={item} Icon={Icon} />;
            })}
            {filtered.length === 0 && <p className="text-xs text-center py-4" style={{ color: theme.nodeSubtext }}>No nodes found</p>}
          </div>
        ) : (
          nodeCategories.map((cat) => (
            <div key={cat.id}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: theme.nodeSubtext }}>
                {cat.label}
              </h3>
              <div className="space-y-1">
                {cat.types.map((type) => {
                  const item = nodeCatalog[type];
                  const Icon = item.icon;
                  return <NodeDragButton key={type} type={type} item={item} Icon={Icon} />;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function NodeDragButton({
  type,
  item,
  Icon,
}: {
  type: WorkflowNodeType;
  item: (typeof nodeCatalog)[WorkflowNodeType];
  Icon: (typeof nodeCatalog)[WorkflowNodeType]["icon"];
}) {
  const { theme } = useWorkflowTheme();
  const nodeColorMap: Record<string, { color: string; bg: string }> = {
    trigger: { color: theme.nodeColors.trigger, bg: theme.nodeColors.triggerBg },
    http: { color: theme.nodeColors.http, bg: theme.nodeColors.httpBg },
    ai: { color: theme.nodeColors.ai, bg: theme.nodeColors.aiBg },
    condition: { color: theme.nodeColors.condition, bg: theme.nodeColors.conditionBg },
    email: { color: theme.nodeColors.email, bg: theme.nodeColors.emailBg },
    database: { color: theme.nodeColors.database, bg: theme.nodeColors.databaseBg },
    code: { color: theme.nodeColors.code, bg: theme.nodeColors.codeBg },
    webhook: { color: theme.nodeColors.webhook, bg: theme.nodeColors.webhookBg },
    delay: { color: theme.nodeColors.delay, bg: theme.nodeColors.delayBg },
    set: { color: theme.nodeColors.set, bg: theme.nodeColors.setBg },
    switch: { color: theme.nodeColors.switch, bg: theme.nodeColors.switchBg },
    merge: { color: theme.nodeColors.merge, bg: theme.nodeColors.mergeBg },
    split: { color: theme.nodeColors.split, bg: theme.nodeColors.splitBg },
    error: { color: theme.nodeColors.error, bg: theme.nodeColors.errorBg },
    auth: { color: theme.nodeColors.auth, bg: theme.nodeColors.authBg },
    document: { color: theme.nodeColors.document, bg: theme.nodeColors.documentBg },
    filter: { color: theme.nodeColors.filter, bg: theme.nodeColors.filterBg },
    approval: { color: theme.nodeColors.approval, bg: theme.nodeColors.approvalBg },
    idempotency: { color: theme.nodeColors.idempotency, bg: theme.nodeColors.idempotencyBg },
  };
  const nc = nodeColorMap[type] ?? { color: theme.accent, bg: theme.accentLight };
  return (
    <button
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(dragMimeType, type);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-200 group cursor-grab active:cursor-grabbing"
      style={{ border: `1px solid ${theme.nodeBorder}`, backgroundColor: theme.nodeConfigBg }}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
        style={{ backgroundColor: nc.bg, border: `1px solid ${nc.color}33` }}
      >
        <span style={{ color: nc.color }}><Icon className="w-4 h-4" /></span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate" style={{ color: theme.nodeText }}>{item.label}</span>
        <span className="block text-[10px] truncate" style={{ color: theme.nodeSubtext }}>{item.description}</span>
      </div>
    </button>
  );
}

function WorkflowDropdown({
  workflows,
  workflowId,
  onLoad,
}: {
  workflows: PersistedWorkflow[];
  workflowId: string | null;
  onLoad: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = workflows.find((w) => w.id === workflowId);
  const { theme } = useWorkflowTheme();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors min-w-[160px]"
        style={{ color: theme.nodeText, borderColor: theme.sidebarBorder, backgroundColor: theme.nodeConfigBg }}
      >
        <Workflow className="w-3.5 h-3.5" style={{ color: theme.nodeSubtext }} />
        <span className="flex-1 text-left truncate">{selected ? selected.name : "Load workflow..."}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: theme.nodeSubtext }} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 w-full min-w-[240px] rounded-xl border shadow-2xl shadow-black/40 z-50 overflow-hidden"
              style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
            >
              <div className="max-h-[200px] overflow-y-auto">
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => { onLoad(wf.id); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center gap-2"
                    style={{
                      color: wf.id === workflowId ? theme.accent : theme.nodeText,
                      backgroundColor: wf.id === workflowId ? theme.accentLight : "transparent",
                    }}
                  >
                    <Workflow className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{wf.name}</span>
                    <span className="ml-auto text-[10px] shrink-0" style={{ color: theme.nodeSubtext }}>{wf.nodes.length}n</span>
                  </button>
                ))}
                {workflows.length === 0 && (
                  <p className="px-3 py-4 text-xs text-center" style={{ color: theme.nodeSubtext }}>No workflows yet</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function TemplateDocsModal({
  template,
  onClose,
  onUse,
}: {
  template: BuilderTemplate;
  onClose: () => void;
  onUse: (t: BuilderTemplate) => void;
}) {
  const { theme } = useWorkflowTheme();
  const similarTemplates = allTemplates.filter(
    (t) => t.id !== template.id && (template.docs.similar.includes(t.id) || t.docs.similar.includes(template.id))
  ).slice(0, 3);
  const [activeTab, setActiveTab] = useState<"steps" | "connections" | "prerequisites">("steps");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative w-[680px] max-h-[85vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: theme.sidebarBorder }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full" style={{ backgroundColor: theme.accentLight, color: theme.accent }}>
                {template.category}
              </span>
              <span className="text-[10px]" style={{ color: theme.nodeSubtext }}>{template.subcategory}</span>
            </div>
            <h2 className="text-base font-semibold" style={{ color: theme.nodeText }}>{template.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-80 transition-colors" style={{ color: theme.nodeSubtext }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-[13px] leading-relaxed" style={{ color: theme.nodeSubtext }}>{template.docs.overview}</p>

          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: theme.nodeConfigBg }}>
            {(["steps", "connections", "prerequisites"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all capitalize"
                style={{
                  color: activeTab === tab ? theme.accent : theme.nodeSubtext,
                  backgroundColor: activeTab === tab ? theme.accentLight : "transparent",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "steps" && (
            <div className="space-y-2">
              {template.docs.steps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold" style={{ backgroundColor: theme.accentLight, color: theme.accent }}>
                    {i + 1}
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: theme.nodeText }}>{step}</p>
                </div>
              ))}
            </div>
          )}
          {activeTab === "connections" && (
            <div className="space-y-2">
              {template.docs.connections.map((conn, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: theme.accent }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: theme.nodeText }}>{conn}</p>
                </div>
              ))}
            </div>
          )}
          {activeTab === "prerequisites" && (
            <div className="space-y-2">
              {template.docs.prerequisites.map((prereq, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: "#f59e0b" }} />
                  <p className="text-[12px] leading-relaxed" style={{ color: theme.nodeText }}>{prereq}</p>
                </div>
              ))}
            </div>
          )}

          {similarTemplates.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: theme.nodeSubtext }}>Similar Templates</h4>
              <div className="flex gap-2">
                {similarTemplates.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => { onUse(st); onClose(); }}
                    className="px-3 py-2 rounded-lg border text-left transition-all hover:opacity-80"
                    style={{ backgroundColor: theme.nodeConfigBg, borderColor: theme.nodeBorder }}
                  >
                    <span className="text-[11px] font-medium block" style={{ color: theme.nodeText }}>{st.name}</span>
                    <span className="text-[10px]" style={{ color: theme.nodeSubtext }}>{st.nodes.length} nodes</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: theme.sidebarBorder }}>
          <button
            onClick={() => { onUse(template); onClose(); }}
            className="px-4 py-2 rounded-lg text-[12px] font-medium transition-all"
            style={{ backgroundColor: theme.accent, color: "#fff" }}
          >
            Use Template
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TemplatePickerOverlay({
  open,
  onClose,
  onLoadTemplate,
}: {
  open: boolean;
  onClose: () => void;
  onLoadTemplate: (template: BuilderTemplate) => void;
}) {
  const { theme } = useWorkflowTheme();
  const [activeTab, setActiveTab] = useState("All");
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [docsTemplate, setDocsTemplate] = useState<BuilderTemplate | null>(null);
  const [search, setSearch] = useState("");

  const currentSubcats = activeTab !== "All" ? (subcategories[activeTab] ?? []) : [];

  const filtered = useMemo(() => {
    let list = activeTab === "All" ? allTemplates : allTemplates.filter((t) => t.category === activeTab);
    if (activeSub) list = list.filter((t) => t.subcategory === activeSub);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.subcategory.toLowerCase().includes(q));
    }
    return list;
  }, [activeTab, activeSub, search]);

  const nodeColorMap: Record<string, { color: string; bg: string }> = {
    trigger: { color: theme.nodeColors.trigger, bg: theme.nodeColors.triggerBg },
    http: { color: theme.nodeColors.http, bg: theme.nodeColors.httpBg },
    ai: { color: theme.nodeColors.ai, bg: theme.nodeColors.aiBg },
    condition: { color: theme.nodeColors.condition, bg: theme.nodeColors.conditionBg },
    email: { color: theme.nodeColors.email, bg: theme.nodeColors.emailBg },
    database: { color: theme.nodeColors.database, bg: theme.nodeColors.databaseBg },
    code: { color: theme.nodeColors.code, bg: theme.nodeColors.codeBg },
    webhook: { color: theme.nodeColors.webhook, bg: theme.nodeColors.webhookBg },
    delay: { color: theme.nodeColors.delay, bg: theme.nodeColors.delayBg },
    set: { color: theme.nodeColors.set, bg: theme.nodeColors.setBg },
    switch: { color: theme.nodeColors.switch, bg: theme.nodeColors.switchBg },
    merge: { color: theme.nodeColors.merge, bg: theme.nodeColors.mergeBg },
    split: { color: theme.nodeColors.split, bg: theme.nodeColors.splitBg },
    error: { color: theme.nodeColors.error, bg: theme.nodeColors.errorBg },
    auth: { color: theme.nodeColors.auth, bg: theme.nodeColors.authBg },
    document: { color: theme.nodeColors.document, bg: theme.nodeColors.documentBg },
    filter: { color: theme.nodeColors.filter, bg: theme.nodeColors.filterBg },
    approval: { color: theme.nodeColors.approval, bg: theme.nodeColors.approvalBg },
    idempotency: { color: theme.nodeColors.idempotency, bg: theme.nodeColors.idempotencyBg },
    slack: { color: theme.nodeColors.slack, bg: theme.nodeColors.slackBg },
    loop: { color: theme.nodeColors.loop, bg: theme.nodeColors.loopBg },
    wait: { color: theme.nodeColors.wait, bg: theme.nodeColors.waitBg },
  };

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-[860px] max-h-[85vh] rounded-2xl border shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
          style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: theme.sidebarBorder }}>
            <div>
              <h2 className="text-base font-semibold" style={{ color: theme.nodeText }}>Choose a Template</h2>
              <p className="text-xs mt-0.5" style={{ color: theme.nodeSubtext }}>{allTemplates.length} pre-built workflows across {categories.length - 1} categories</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: theme.nodeSubtext }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="pl-8 pr-3 py-1.5 text-[11px] rounded-lg border outline-none w-48"
                  style={{ backgroundColor: theme.nodeConfigBg, borderColor: theme.nodeBorder, color: theme.nodeText }}
                />
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-80 transition-colors" style={{ color: theme.nodeSubtext }}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 px-6 py-3 border-b flex-wrap shrink-0" style={{ borderColor: theme.sidebarBorder }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveTab(cat); setActiveSub(null); }}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap"
                style={{
                  color: activeTab === cat ? theme.accent : theme.nodeSubtext,
                  backgroundColor: activeTab === cat ? theme.accentLight : "transparent",
                  border: `1px solid ${activeTab === cat ? `${theme.accent}33` : "transparent"}`,
                }}
              >
                {cat}
                {cat !== "All" && (
                  <span className="ml-1.5 text-[9px] opacity-60">
                    {allTemplates.filter((t) => t.category === cat).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {currentSubcats.length > 0 && !search && (
            <div className="flex gap-1 px-6 py-2 border-b overflow-x-auto shrink-0" style={{ borderColor: theme.sidebarBorder }}>
              {currentSubcats.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setActiveSub(activeSub === sub ? null : sub)}
                  className="px-2.5 py-1 text-[10px] font-medium rounded-md transition-all whitespace-nowrap"
                  style={{
                    color: activeSub === sub ? theme.accent : theme.nodeSubtext,
                    backgroundColor: activeSub === sub ? theme.accentLight : theme.nodeConfigBg,
                    border: `1px solid ${activeSub === sub ? `${theme.accent}33` : theme.nodeBorder}`,
                  }}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: theme.nodeSubtext }}>No templates found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((template) => {
                  const uniqueTypes = [...new Set(template.nodes.map((n) => n.type))];
                  return (
                    <div
                      key={template.id}
                      className="text-left rounded-xl border p-4 transition-all hover:shadow-lg group"
                      style={{ backgroundColor: theme.nodeConfigBg, borderColor: theme.nodeBorder }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full" style={{ backgroundColor: theme.accentLight, color: theme.accent }}>
                          {template.subcategory}
                        </span>
                        <span className="text-[10px]" style={{ color: theme.nodeSubtext }}>
                          {template.nodes.length} nodes
                        </span>
                      </div>
                      <h3 className="text-[13px] font-semibold mb-1 group-hover:text-white transition-colors" style={{ color: theme.nodeText }}>
                        {template.name}
                      </h3>
                      <p className="text-[11px] leading-relaxed mb-3" style={{ color: theme.nodeSubtext }}>
                        {template.description}
                      </p>
                      <div className="flex items-center gap-1.5 mb-3">
                        {uniqueTypes.map((type) => {
                          const nc = nodeColorMap[type] ?? { color: theme.accent, bg: theme.accentLight };
                          return (
                            <div
                              key={type}
                              className="w-5 h-5 rounded flex items-center justify-center"
                              style={{ backgroundColor: nc.bg, border: `1px solid ${nc.color}33` }}
                              title={type}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: nc.color }} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDocsTemplate(template)}
                          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all hover:opacity-80"
                          style={{ borderColor: theme.nodeBorder, color: theme.nodeSubtext }}
                        >
                          View Docs
                        </button>
                        <button
                          onClick={() => { onLoadTemplate(template); onClose(); }}
                          className="flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all"
                          style={{ backgroundColor: theme.accent, color: "#fff" }}
                        >
                          Use Template
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {docsTemplate && (
          <TemplateDocsModal
            template={docsTemplate}
            onClose={() => setDocsTemplate(null)}
            onUse={(t) => { onLoadTemplate(t); onClose(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function QuickAddPicker({
  position,
  onSelect,
  onClose,
}: {
  position: { x: number; y: number };
  onSelect: (type: WorkflowNodeType) => void;
  onClose: () => void;
}) {
  const { theme } = useWorkflowTheme();
  const [search, setSearch] = useState("");

  const filtered = search
    ? workflowNodeTypes.filter((t) => {
        const item = nodeCatalog[t];
        return item.label.toLowerCase().includes(search.toLowerCase())
          || item.description.toLowerCase().includes(search.toLowerCase());
      })
    : null;

  const nodeColorMap: Record<string, { color: string; bg: string }> = {
    trigger: { color: theme.nodeColors.trigger, bg: theme.nodeColors.triggerBg },
    http: { color: theme.nodeColors.http, bg: theme.nodeColors.httpBg },
    ai: { color: theme.nodeColors.ai, bg: theme.nodeColors.aiBg },
    condition: { color: theme.nodeColors.condition, bg: theme.nodeColors.conditionBg },
    email: { color: theme.nodeColors.email, bg: theme.nodeColors.emailBg },
    database: { color: theme.nodeColors.database, bg: theme.nodeColors.databaseBg },
    code: { color: theme.nodeColors.code, bg: theme.nodeColors.codeBg },
    webhook: { color: theme.nodeColors.webhook, bg: theme.nodeColors.webhookBg },
    delay: { color: theme.nodeColors.delay, bg: theme.nodeColors.delayBg },
    set: { color: theme.nodeColors.set, bg: theme.nodeColors.setBg },
    switch: { color: theme.nodeColors.switch, bg: theme.nodeColors.switchBg },
    merge: { color: theme.nodeColors.merge, bg: theme.nodeColors.mergeBg },
    split: { color: theme.nodeColors.split, bg: theme.nodeColors.splitBg },
    error: { color: theme.nodeColors.error, bg: theme.nodeColors.errorBg },
    auth: { color: theme.nodeColors.auth, bg: theme.nodeColors.authBg },
    document: { color: theme.nodeColors.document, bg: theme.nodeColors.documentBg },
    filter: { color: theme.nodeColors.filter, bg: theme.nodeColors.filterBg },
    approval: { color: theme.nodeColors.approval, bg: theme.nodeColors.approvalBg },
    idempotency: { color: theme.nodeColors.idempotency, bg: theme.nodeColors.idempotencyBg },
  };

  const getIconColor = (type: string) => nodeColorMap[type]?.color ?? theme.accent;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[200] w-64 rounded-xl border shadow-2xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y - 120,
        backgroundColor: theme.configPanelBg,
        borderColor: theme.sidebarBorder,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: theme.nodeSubtext }} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg placeholder-slate-500 focus:outline-none"
            style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto px-1 pb-1">
        {(filtered ? [{ id: "filtered" as const, label: "Results", types: filtered }] : nodeCategories).map((cat) => (
          <div key={cat.id}>
            <p className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1" style={{ color: theme.nodeSubtext }}>
              {"label" in cat ? cat.label : ""}
            </p>
            {"types" in cat && cat.types.map((type) => {
              const item = nodeCatalog[type];
              const Icon = item.icon;
              const color = getIconColor(type);
              return (
                <button
                  key={type}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/5"
                  onClick={() => onSelect(type)}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                  >
                    <span style={{ color }}><Icon className="w-3.5 h-3.5" /></span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: theme.nodeText }}>{item.label}</p>
                    <p className="text-[10px] truncate" style={{ color: theme.nodeSubtext }}>{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function EdgeInfoPanel({
  edgeId,
  onClose,
}: {
  edgeId: string;
  onClose: () => void;
}) {
  const { theme } = useWorkflowTheme();
  const { edges, nodes } = useWorkflowStore();
  const edge = edges.find((e) => e.id === edgeId);

  if (!edge) return null;

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = sourceNode ? (sourceNode.data as WorkflowNodeData).label : "Unknown";
  const targetLabel = targetNode ? (targetNode.data as WorkflowNodeData).label : "Unknown";
  const sourceType = sourceNode ? (sourceNode.data as WorkflowNodeData).type : "unknown";
  const targetType = targetNode ? (targetNode.data as WorkflowNodeData).type : "unknown";

  const handleDelete = () => {
    useWorkflowStore.setState((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
    }));
    onClose();
  };

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="w-80 border-l flex flex-col overflow-y-auto shrink-0 max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-40 max-sm:w-[min(320px,88vw)] max-sm:shadow-[-8px_0_28px_rgba(0,0,0,0.55)]"
      style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: theme.sidebarBorder }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accent }} />
          <h3 className="text-sm font-semibold" style={{ color: theme.nodeText }}>Connection</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:opacity-80 transition-colors" style={{ color: theme.nodeSubtext }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Source */}
        <div className="p-3 rounded-xl" style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}` }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: theme.nodeSubtext }}>Source</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.nodeColors[sourceType as keyof typeof theme.nodeColors] ?? theme.accent }} />
            <div>
              <p className="text-xs font-medium" style={{ color: theme.nodeText }}>{sourceLabel}</p>
              <p className="text-[10px]" style={{ color: theme.nodeSubtext }}>{sourceType}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.accentLight, color: theme.accent }}>
              {edge.sourceHandle ?? "main"}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <div className="w-8 h-0.5 rounded-full" style={{ backgroundColor: theme.edgeColor }} />
          <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent" style={{ borderLeftColor: theme.edgeColor }} />
        </div>

        {/* Target */}
        <div className="p-3 rounded-xl" style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}` }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: theme.nodeSubtext }}>Target</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.nodeColors[targetType as keyof typeof theme.nodeColors] ?? theme.accent }} />
            <div>
              <p className="text-xs font-medium" style={{ color: theme.nodeText }}>{targetLabel}</p>
              <p className="text-[10px]" style={{ color: theme.nodeSubtext }}>{targetType}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.accentLight, color: theme.accent }}>
              {edge.targetHandle ?? "main"}
            </span>
          </div>
        </div>

        {/* Edge properties */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: theme.nodeSubtext }}>Properties</p>
          <div className="flex items-center justify-between text-xs" style={{ color: theme.nodeText }}>
            <span>Type</span>
            <span className="font-mono" style={{ color: theme.nodeSubtext }}>{edge.type ?? "default"}</span>
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: theme.nodeText }}>
            <span>Animated</span>
            <span className="font-mono" style={{ color: theme.nodeSubtext }}>{edge.animated ? "yes" : "no"}</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t" style={{ borderColor: theme.sidebarBorder }}>
        <button
          onClick={handleDelete}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Connection
        </button>
      </div>
    </motion.div>
  );
}

function BuilderInner() {
  const flow = useRef<ReactFlowInstance<WorkflowGraphNode, WorkflowEdge> | null>(null);
  const { theme } = useWorkflowTheme();
  const params = useParams();
  const {
    workflowId, workflowName, nodes, edges, onNodesChange, onEdgesChange, connect, addNode,
    setWorkflowId, setWorkflowName, loadWorkflow, newWorkflow,
    selectedNodeId, sidebarCollapsed, configPanelOpen,
    toggleSidebar, toggleConfigPanel, setSelectedNodeId, showToast,
  } = useWorkflowStore();

  const [workflows, setWorkflows] = useState<PersistedWorkflow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [execution, setExecution] = useState<PersistedExecution | null>(null);
  const [search, setSearch] = useState("");
  const [showExecution, setShowExecution] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ nodeId: string; handleId: string; position: { x: number; y: number } } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">("DRAFT");
  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const [launch, setLaunch] = useState<{
    name: string;
    nodeNames: string[];
    executionId: string | null;
    error: string | null;
  } | null>(null);

  // Phones: start with the node library collapsed — a 240px sidebar plus a
  // 320px config panel leave no canvas below lg. Runs post-mount so the
  // server-rendered markup stays hydration-safe.
  useEffect(() => {
    if (window.innerWidth < 1024 && !useWorkflowStore.getState().sidebarCollapsed) {
      toggleSidebar();
    }
  }, [toggleSidebar]);

  /* What activation actually enables. Webhook/cron triggers only fire while
   * the workflow is ACTIVE (the webhook route and scheduler both filter on
   * status), so this is what gives the Activate button its role. */
  const triggerInfo = useMemo(() => {
    let webhook = false;
    let cron = false;
    let cronExpr = "";
    for (const n of nodes) {
      const d = n.data as WorkflowNodeData;
      if (d.type === "webhook") { webhook = true; continue; }
      if (d.type === "trigger") {
        const cfg = (d.config ?? {}) as Record<string, unknown>;
        if (cfg.triggerType === "webhook") webhook = true;
        if (cfg.triggerType === "cron") {
          cron = true;
          cronExpr = typeof cfg.cronExpression === "string" ? cfg.cronExpression.trim() : "";
        }
      }
    }
    return { webhook, cron, cronExpr };
  }, [nodes]);
  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);

  // Reset status when workflowId changes (e.g. new workflow)
  useEffect(() => {
    if (!workflowId) setWorkflowStatus("DRAFT");
  }, [workflowId]);

  // Load workflow from API on mount if URL has an ID
  useEffect(() => {
    const urlId = params?.id;
    if (urlId && typeof urlId === "string" && urlId !== "builder") {
      void (async () => {
        try {
          const response = await getWorkflow(urlId);
          loadWorkflow(toCanvasGraph(response.workflow));
          setWorkflowStatus(response.workflow.status ?? "DRAFT");
        } catch {
          showToast("Failed to load workflow", "error");
        }
      })();
    } else if (!urlId || urlId === "builder") {
      newWorkflow();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(dragMimeType) as WorkflowNodeType;
      if (!workflowNodeTypes.includes(type) || !flow.current) return;
      addNode(type, flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode]
  );

  const handleQuickAdd = useCallback((nodeId: string, handleId: string, position: { x: number; y: number }) => {
    setQuickAdd({ nodeId, handleId, position });
  }, []);

  const executeQuickAdd = useCallback((type: WorkflowNodeType) => {
    if (!quickAdd || !flow.current) return;
    const sourceNode = nodes.find((n) => n.id === quickAdd.nodeId);
    if (!sourceNode) return;

    const newPos = flow.current.screenToFlowPosition({
      x: quickAdd.position.x,
      y: quickAdd.position.y,
    });

    const newNodeId = crypto.randomUUID();
    const config: Record<string, unknown> = {};
    const catalogEntry = nodeCatalog[type];
    for (const field of catalogEntry.configFields) {
      if (field.defaultValue !== undefined) config[field.key] = field.defaultValue;
    }

    const newNode = {
      id: newNodeId,
      type: "workflow" as const,
      position: newPos,
      data: { label: catalogEntry.label, type, config },
    };

    const newEdge = {
      id: crypto.randomUUID(),
      source: quickAdd.nodeId,
      target: newNodeId,
      sourceHandle: quickAdd.handleId,
      targetHandle: "main",
      animated: true,
      type: "default" as const,
    };

    useWorkflowStore.setState((state) => ({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, newEdge],
    }));

    setQuickAdd(null);
  }, [quickAdd, nodes]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__fluxAddStep = handleQuickAdd;
    return () => {
      delete (window as unknown as Record<string, unknown>).__fluxAddStep;
    };
  }, [handleQuickAdd]);

  const refreshWorkflows = useCallback(async () => {
    try {
      const response = await listWorkflows();
      setWorkflows(response.workflows);
    } catch (err) {
      // Non-critical: don't show error toast on background refresh failures
      console.warn("[refreshWorkflows] Failed to load workflows:", err);
    }
  }, []);

  useEffect(() => { void refreshWorkflows(); }, [refreshWorkflows]);

  useEffect(() => {
    if (!execution || (execution.status !== "PENDING" && execution.status !== "RUNNING")) return;
    const timer = window.setTimeout(() => {
      void getExecution(execution.id)
        .then((response) => {
          setExecution(response.execution);
          if (response.execution.status !== "PENDING" && response.execution.status !== "RUNNING") {
            setShowExecution(true);
            showToast(
              response.execution.status === "SUCCESS" ? "Workflow completed!" : "Workflow failed",
              response.execution.status === "SUCCESS" ? "success" : "error"
            );
          }
        })
        .catch((err) => {
          console.warn("[execution polling] Failed to fetch execution:", err);
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [execution, showToast]);

  const saveWorkflow = async () => {
    if (nodes.length === 0) { showToast("Add at least one node before saving", "error"); return; }
    setIsSaving(true);
    const payload: WorkflowPayload = {
      name: workflowName.trim() || "Untitled workflow",
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        name: node.data.label,
        config: (node.data.config ?? {}) as Record<string, unknown>,
        position: node.position,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
        config: {
          ...(edge.data as Record<string, unknown> ?? {}),
          branch: edge.sourceHandle ?? "main",
        },
      })),
    };
    try {
      const response = workflowId
        ? await updateExistingWorkflow(workflowId, payload)
        : await saveNewWorkflow(payload);
      setWorkflowId(response.workflow.id);
      setWorkflowName(response.workflow.name);
      setWorkflowStatus(response.workflow.status ?? "DRAFT");
      // The server regenerates any node id that is already stored for another
      // workflow — adopt its graph when that happens so the canvas and the
      // database never drift apart.
      const serverNodeIds = response.workflow.nodes.map((n) => n.id);
      if (
        serverNodeIds.length !== payload.nodes.length ||
        serverNodeIds.some((serverId, i) => serverId !== payload.nodes[i].id)
      ) {
        loadWorkflow(toCanvasGraph(response.workflow));
      }
      showToast("Workflow saved", "success");
      await refreshWorkflows();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const loadSelectedWorkflow = async (id: string) => {
    if (!id) return;
    try {
      const response = await getWorkflow(id);
      loadWorkflow(toCanvasGraph(response.workflow));
      setWorkflowStatus(response.workflow.status ?? "DRAFT");
      showToast("Workflow loaded", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Load failed", "error");
    }
  };

  const runCurrentWorkflow = async () => {
    if (!workflowId) { showToast("Save the workflow first", "error"); return; }
    // Stage the launch sequence while the run is kicked off in parallel,
    // so the countdown plays over a real request â€” never a fake delay.
    setLaunch({
      name: workflowName || "Untitled workflow",
      nodeNames: nodes
        .map((n) => (n.data as WorkflowNodeData).label)
        .filter((v): v is string => typeof v === "string"),
      executionId: null,
      error: null,
    });
    try {
      const response = await runWorkflow(workflowId);
      setExecution(response.execution);
      setShowExecution(true);
      setLaunch((prev) => (prev ? { ...prev, executionId: response.execution.id } : prev));
      showToast("Execution started", "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Run failed";
      showToast(msg, "error");
      setLaunch((prev) => (prev ? { ...prev, error: msg } : prev));
    }
  };

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setQuickAdd(null);
  }, [setSelectedNodeId]);

  const loadTemplate = useCallback((template: BuilderTemplate) => {
    newWorkflow();
    const canvasNodes: WorkflowGraphNode[] = template.nodes.map((n) => ({
      id: crypto.randomUUID(),
      type: "workflow",
      position: n.position,
      data: { label: n.label, type: n.type as WorkflowNodeType, config: { ...defaultNodeConfig(n.type), ...(n.config ?? {}) } },
    }));
    const canvasEdges: WorkflowEdge[] = template.edges.map((e) => ({
      id: crypto.randomUUID(),
      source: canvasNodes[e.from].id,
      target: canvasNodes[e.to].id,
      sourceHandle: e.sourceHandle ?? "main",
      animated: true,
      type: "default" as const,
    }));
    loadWorkflow({ id: null as unknown as string, name: template.name, nodes: canvasNodes, edges: canvasEdges });
    setWorkflowName(template.name);
    setWorkflowStatus("DRAFT");
    setShowTemplatePicker(false);
  }, [loadWorkflow, setWorkflowName, newWorkflow]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: theme.canvas }}
    >
      <ToastContainer />

      {/* Header */}
      <header
        className="flex items-center justify-between gap-2 h-12 px-3 border-b backdrop-blur-xl shrink-0 z-30"
        style={{ backgroundColor: theme.headerBg, borderColor: theme.headerBorder }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-1">
          {/* Home affordance — the builder is a fullscreen route with no app
              shell, so it needs its own link back to the landing page. */}
          <Link
            href="/"
            aria-label="Back to the FluX home page"
            className="shrink-0 flex items-center hover:opacity-80 transition-opacity"
          >
            <FluxLogoMark size={20} />
          </Link>
          <Link
            href="/workflows"
            aria-label="Back to workflows"
            className="shrink-0 flex items-center text-[13px] hover:opacity-80 transition-opacity px-1.5 py-1 rounded-lg"
            style={{ color: theme.nodeSubtext }}
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="w-px h-4 shrink-0 hidden sm:block" style={{ backgroundColor: theme.sidebarBorder }} />
          <input
            aria-label="Workflow name"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-transparent border-none text-[13px] font-semibold focus:outline-none min-w-0 w-full sm:w-48 shrink"
            style={{ color: theme.nodeText }}
            placeholder="Untitled workflow"
          />
          {workflowId && <span className="text-[10px] font-mono hidden md:inline shrink-0" style={{ color: theme.nodeSubtext }}>{workflowId.slice(0, 6)}</span>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden sm:block"><WorkflowDropdown workflows={workflows} workflowId={workflowId} onLoad={loadSelectedWorkflow} /></div>
          <div className="hidden sm:block"><NewWorkflowDropdown onFromTemplate={() => setShowTemplatePicker(true)} /></div>
          <div className="hidden sm:block"><ThemePicker /></div>
          <div className="w-px h-4 hidden sm:block" style={{ backgroundColor: theme.sidebarBorder }} />
          <button onClick={toggleSidebar} className="p-1.5 rounded-lg transition-colors" style={{ color: theme.nodeSubtext }} title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              if (!configPanelOpen) {
                toggleConfigPanel();
              } else if (!selectedNodeId) {
                toggleConfigPanel();
              } else {
                toggleConfigPanel();
              }
            }}
            className="p-1.5 rounded-lg transition-colors hidden sm:block"
            style={{ color: theme.nodeSubtext }}
            title={configPanelOpen ? "Hide config" : "Show config"}
          >
            {configPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <div className="w-px h-4 hidden sm:block" style={{ backgroundColor: theme.sidebarBorder }} />
          <button
            onClick={() => void saveWorkflow()}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors border disabled:opacity-50"
            style={{ color: theme.nodeText, borderColor: theme.sidebarBorder, backgroundColor: theme.nodeConfigBg }}
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void runCurrentWorkflow()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg shadow-lg transition-all"
            style={{ backgroundColor: theme.accent, boxShadow: `0 4px 14px rgba(${theme.accentHue}, 0.3)` }}
          >
            <Play className="w-3 h-3" fill="white" /> Run
          </button>
          {workflowId && (
            <>
              <div className="w-px h-4 hidden sm:block" style={{ backgroundColor: theme.sidebarBorder }} />
              <div className="relative flex items-center gap-1.5">
                {/* State pill — makes the Activate button's role visible.
                    Webhook + cron triggers only fire while ACTIVE, so a draft
                    workflow with triggers is visibly "paused". */}
                {triggerInfo.webhook || triggerInfo.cron ? (
                  workflowStatus === "ACTIVE" ? (
                    <span
                      className="hidden md:flex items-center gap-1 px-2 py-1 text-[9.5px] font-semibold rounded-full shrink-0"
                      style={{ color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {triggerInfo.webhook ? "Webhook live" : `Scheduled${triggerInfo.cronExpr ? ` · ${triggerInfo.cronExpr}` : ""}`}
                    </span>
                  ) : (
                    <span
                      className="hidden md:flex items-center gap-1 px-2 py-1 text-[9.5px] font-semibold rounded-full shrink-0"
                      style={{ color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}
                      title="Webhook and cron triggers only fire while the workflow is active"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {triggerInfo.webhook ? "Webhook paused" : "Schedule paused"}
                    </span>
                  )
                ) : (
                  <span
                    className="hidden md:inline text-[9.5px] shrink-0"
                    style={{ color: theme.nodeSubtext }}
                    title="Add a Webhook or Cron trigger node to enable automatic runs"
                  >
                    manual runs
                  </span>
                )}
                <button
                  onClick={async () => {
                    const newStatus = workflowStatus === "ACTIVE" ? "DRAFT" : "ACTIVE";
                    try {
                      await updateWorkflowStatus(workflowId, newStatus);
                      setWorkflowStatus(newStatus);
                      showToast(
                        newStatus === "ACTIVE"
                          ? triggerInfo.webhook || triggerInfo.cron
                            ? "Workflow activated — triggers are live"
                            : "Workflow activated"
                          : "Workflow deactivated — triggers paused",
                        newStatus === "ACTIVE" ? "success" : "info"
                      );
                      await refreshWorkflows();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-all border shrink-0"
                  style={{
                    color: workflowStatus === "ACTIVE" ? "#34d399" : theme.nodeSubtext,
                    borderColor: workflowStatus === "ACTIVE" ? "rgba(52, 211, 153, 0.3)" : theme.sidebarBorder,
                    backgroundColor: workflowStatus === "ACTIVE" ? "rgba(52, 211, 153, 0.08)" : theme.nodeConfigBg,
                  }}
                  title={
                    workflowStatus === "ACTIVE"
                      ? "Active — webhook & cron triggers are live. Click to deactivate"
                      : "Draft — webhook & cron triggers are paused. Click to activate"
                  }
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: workflowStatus === "ACTIVE" ? "#34d399" : "#64748b" }}
                  />
                  {workflowStatus === "ACTIVE" ? "Active" : "Activate"}
                </button>
                {/* Webhook URL — only meaningful once the workflow is ACTIVE,
                    since the webhook route filters on status: ACTIVE. */}
                {triggerInfo.webhook && workflowStatus === "ACTIVE" && (
                  <button
                    onClick={() => setShowWebhookUrl((v) => !v)}
                    className="p-1.5 rounded-lg transition-colors border hidden sm:block"
                    style={{ color: theme.nodeSubtext, borderColor: theme.sidebarBorder, backgroundColor: theme.nodeConfigBg }}
                    title="Show webhook URL"
                  >
                    <Globe className="w-3 h-3" />
                  </button>
                )}
              </div>
              <AnimatePresence>
                {showWebhookUrl && workflowId && triggerInfo.webhook && workflowStatus === "ACTIVE" && (
                  <>
                    {/* Backdrop */}
                    <motion.div
                      key="webhook-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-40"
                      onClick={() => setShowWebhookUrl(false)}
                    />
                    {/* Panel */}
                    <motion.div
                      key="webhook-panel"
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                      className="absolute top-full right-0 mt-2 z-50 w-88 rounded-2xl border shadow-2xl shadow-black/60 overflow-hidden"
                      style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${theme.sidebarBorder}` }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: theme.accentLight }}>
                            <Globe className="w-4 h-4" style={{ color: theme.accent }} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold" style={{ color: theme.nodeText }}>Webhook Endpoint</p>
                            <p className="text-[10px]" style={{ color: theme.nodeSubtext }}>POST to trigger Â· no API key required</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowWebhookUrl(false)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: theme.nodeSubtext, backgroundColor: theme.nodeConfigBg }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="px-4 py-3 space-y-3">
                        <p className="text-[11px] leading-relaxed" style={{ color: theme.nodeSubtext }}>
                          Send any JSON body to this URL to trigger the workflow. Data is accessible as{" "}
                          <code className="font-mono text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: theme.nodeConfigBg, color: theme.accent }}>
                            trigger.body
                          </code>{" "}
                          in your nodes.
                        </p>

                        {/* URL box */}
                        <div className="p-3 rounded-xl" style={{ backgroundColor: theme.canvas }}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.accent }} />
                            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.nodeSubtext }}>
                              Endpoint
                            </span>
                          </div>
                          <div className="font-mono text-[11px] break-all leading-relaxed" style={{ color: theme.nodeText }}>
                            {getWebhookUrl(workflowId)}
                          </div>
                        </div>

                        {/* Copy button */}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(getWebhookUrl(workflowId));
                            showToast("Webhook URL copied to clipboard", "success");
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-semibold text-white rounded-xl transition-all hover:brightness-110 active:scale-[0.98]"
                          style={{ backgroundColor: theme.accent, boxShadow: `0 4px 14px rgba(${theme.accentHue}, 0.35)` }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Webhook URL
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left sidebar - Node library (always renders, collapses to icons) */}
        <motion.aside
          initial={false}
          animate={{ width: sidebarCollapsed ? 68 : 240 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="border-r flex flex-col shrink-0 overflow-hidden"
          style={{ borderColor: theme.sidebarBorder, backgroundColor: theme.sidebarBg }}
        >
          <div className="p-2 flex flex-col h-full">
            {!sidebarCollapsed && (
              <div className="mb-1 px-1">
                <h2 className="text-xs font-semibold mb-0.5" style={{ color: theme.nodeText }}>Node Library</h2>
                <p className="text-[10px] mb-3" style={{ color: theme.nodeSubtext }}>Drag onto canvas</p>
              </div>
            )}
            {sidebarCollapsed && <div className="h-2" />}
            <SidebarContent search={search} setSearch={setSearch} collapsed={sidebarCollapsed} />
          </div>
        </motion.aside>

        {/* Canvas */}
        <div
          className="flex-1 min-h-0 relative"
          style={{ backgroundColor: theme.canvas }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: theme.canvasPattern === "dots"
              ? `radial-gradient(circle, ${theme.patternColor} 1px, transparent 1px)`
              : theme.canvasPattern === "grid"
              ? `linear-gradient(${theme.patternColor} 1px, transparent 1px), linear-gradient(90deg, ${theme.patternColor} 1px, transparent 1px)`
              : theme.canvasPattern === "cells"
              ? `radial-gradient(circle, ${theme.patternColor} 1px, transparent 1px), linear-gradient(${theme.patternColor} 1px, transparent 1px)`
              : theme.canvasPattern === "crosshatch"
              ? `repeating-linear-gradient(45deg, ${theme.patternColor} 0, ${theme.patternColor} 1px, transparent 1px, transparent 8px), repeating-linear-gradient(-45deg, ${theme.patternColor} 0, ${theme.patternColor} 1px, transparent 1px, transparent 8px)`
              : theme.canvasPattern === "mesh"
              ? `radial-gradient(circle, ${theme.patternColor} 1px, transparent 1px), linear-gradient(${theme.patternColor} 0.5px, transparent 0.5px), linear-gradient(90deg, ${theme.patternColor} 0.5px, transparent 0.5px)`
              : "none",
            backgroundSize: theme.canvasPattern === "mesh"
              ? `${theme.patternGap}px ${theme.patternGap}px, ${theme.patternGap / 2}px ${theme.patternGap / 2}px, ${theme.patternGap / 2}px ${theme.patternGap / 2}px`
              : theme.canvasPattern === "grid"
              ? `${theme.patternGap}px ${theme.patternGap}px`
              : theme.canvasPattern === "cells"
              ? `${theme.patternGap}px ${theme.patternGap}px, ${theme.patternGap}px ${theme.patternGap}px`
              : `${theme.patternGap}px ${theme.patternGap}px`,
            zIndex: 0,
          }} />
          <div className="absolute inset-0" style={{ zIndex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            onInit={(instance) => { flow.current = instance; }}
            fitView
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
            onPaneClick={handleCanvasClick}
            onNodeClick={(_, node) => {
              setSelectedEdgeId(null);
              const current = useWorkflowStore.getState().selectedNodeId;
              useWorkflowStore.getState().setSelectedNodeId(current === node.id ? null : node.id);
            }}
            onEdgeClick={(_, edge) => {
              useWorkflowStore.getState().setSelectedNodeId(null);
              setSelectedEdgeId(selectedEdgeId === edge.id ? null : edge.id);
            }}
            defaultEdgeOptions={{ type: "default", animated: true }}
            connectionLineStyle={{ stroke: "#818cf8", strokeWidth: 2 }}
            connectionRadius={30}
            snapToGrid
            snapGrid={[16, 16]}
          >
            <Controls
              showInteractive={false}
              className="!border !backdrop-blur-xl !shadow-xl !shadow-black/20"
              style={{ borderColor: theme.sidebarBorder, backgroundColor: theme.configPanelBg }}
            />
            <MiniMap
              nodeStrokeWidth={3}
              zoomable
              pannable
              className="!border !backdrop-blur-xl max-sm:hidden"
              style={{ borderColor: theme.sidebarBorder, backgroundColor: theme.configPanelBg, position: "absolute", bottom: 10, right: 10 }}
              maskColor={theme.minimapMask}
              nodeColor={(node) => {
                const data = node.data as WorkflowNodeData;
                const typeColors: Record<string, string> = {
                  trigger: theme.nodeColors.trigger,
                  http: theme.nodeColors.http,
                  ai: theme.nodeColors.ai,
                  condition: theme.nodeColors.condition,
                  email: theme.nodeColors.email,
                  database: theme.nodeColors.database,
                  code: theme.nodeColors.code,
                  webhook: theme.nodeColors.webhook,
                  delay: theme.nodeColors.delay,
                  set: theme.nodeColors.set,
                  switch: theme.nodeColors.switch,
                  merge: theme.nodeColors.merge,
                  split: theme.nodeColors.split,
                  error: theme.nodeColors.error,
                  auth: theme.nodeColors.auth,
                  document: theme.nodeColors.document,
                  filter: theme.nodeColors.filter,
                  approval: theme.nodeColors.approval,
                  idempotency: theme.nodeColors.idempotency,
                  slack: theme.nodeColors.slack,
                  loop: theme.nodeColors.loop,
                  wait: theme.nodeColors.wait,
                };
                return typeColors[data.type] ?? theme.accent;
              }}
            />
          </ReactFlow>
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 2 }}>
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}` }}>
                  <Workflow className="w-8 h-8" style={{ color: theme.nodeSubtext }} />
                </div>
                <p className="text-sm font-medium" style={{ color: theme.nodeSubtext }}>
                  Drag nodes from the sidebar to build your workflow
                </p>
                <p className="text-[11px] mt-1" style={{ color: theme.nodeSubtext }}>
                  Connect nodes by dragging between handles
                </p>
              </div>
            </div>
          )}

          <AnimatePresence>
            {showExecution && execution && (
              <AnalysisPanel execution={execution} onClose={() => setShowExecution(false)} />
            )}
          </AnimatePresence>

          {/* Quick-add node picker popup */}
          <AnimatePresence>
            {quickAdd && (
              <QuickAddPicker
                position={quickAdd.position}
                onSelect={executeQuickAdd}
                onClose={() => setQuickAdd(null)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Right panel - Config */}
        <AnimatePresence>
          {selectedEdgeId && (
            <EdgeInfoPanel
              edgeId={selectedEdgeId}
              onClose={() => setSelectedEdgeId(null)}
            />
          )}
          {!selectedEdgeId && configPanelOpen && (
            selectedNodeId ? <NodeConfigPanel /> : <EmptyConfigPanel />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTemplatePicker && (
          <TemplatePickerOverlay
            open={showTemplatePicker}
            onClose={() => setShowTemplatePicker(false)}
            onLoadTemplate={loadTemplate}
          />
        )}
      </AnimatePresence>

      {/* Launch sequence â€” 3Â·2Â·1 countdown before a run */}
      <AnimatePresence>
        {launch && (
          <LaunchSequence
            workflowName={launch.name}
            nodeNames={launch.nodeNames}
            executionId={launch.executionId}
            runError={launch.error}
            onComplete={() => setLaunch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function WorkflowBuilder() {
  return (
    <WorkflowThemeProvider>
      <BuilderInner />
    </WorkflowThemeProvider>
  );
}
