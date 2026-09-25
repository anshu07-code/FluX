"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, Info, Trash2, Copy, Check, Plus, Braces, List } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { useWorkflowTheme } from "@/lib/workflow-themes";
import { nodeCatalog, type NodeConfigField, type WorkflowNodeData } from "./workflow-types";

function CustomSelect({
  value,
  options,
  onChange,
  theme,
}: {
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
  theme: ReturnType<typeof useWorkflowTheme>["theme"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = options.map((opt) => ({
    value: typeof opt === "string" ? opt : opt.value,
    label: typeof opt === "string" ? opt : opt.label,
  }));
  const selected = items.find((i) => i.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition-all"
        style={{
          backgroundColor: theme.nodeConfigBg,
          border: `1px solid ${open ? theme.accent + "66" : theme.nodeBorder}`,
          color: selected ? theme.nodeText : theme.nodeSubtext,
        }}
      >
        <span className="truncate">{selected?.label ?? "Select..."}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 ml-2 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: theme.nodeSubtext }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-1 rounded-lg border shadow-xl overflow-hidden max-h-48 overflow-y-auto"
            style={{ backgroundColor: theme.configPanelBg, borderColor: theme.sidebarBorder }}
          >
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => { onChange(item.value); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-all"
                style={{
                  color: item.value === value ? theme.accent : theme.nodeText,
                  backgroundColor: item.value === value ? theme.accentLight : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (item.value !== value) e.currentTarget.style.backgroundColor = theme.nodeConfigBg;
                }}
                onMouseLeave={(e) => {
                  if (item.value !== value) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {item.value === value && <Check className="w-3 h-3 shrink-0" style={{ color: theme.accent }} />}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Converts a JSON value to key-value pairs, filtering out nested objects. */
function toKeyValuePairs(value: unknown): Array<{ key: string; value: string }> {
  // Switch rules may arrive as `[{ value, output }]` (template default shape).
  if (Array.isArray(value) && value.length > 0 && value.every((v) => v && typeof v === "object" && "value" in v && "output" in v)) {
    return (value as Array<{ value: unknown; output: unknown }>).map((v) => ({
      key: String(v.value ?? ""),
      value: String(v.output ?? ""),
    }));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v !== "object" || v === null)
    .map(([k, v]) => ({ key: k, value: v === null ? "" : String(v) }));
}

/** Converts key-value pairs back to a plain object (keys still being typed are dropped). */
function fromKeyValuePairs(pairs: Array<{ key: string; value: string }>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim()) obj[key.trim()] = value;
  }
  return obj;
}

/** Stable JSON snapshot used to detect external value changes. */
function snapshotValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return String(value);
  }
}

/** Pretty-print a config value for the JSON editor. */
function serializeJson(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value ?? "");
}

/**
 * Entries the row editor can't represent (nested objects/arrays).
 * They are carried through KV edits so switching to Fields mode
 * never silently deletes nested config.
 */
function extractPassthrough(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const passthrough: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "object" && v !== null) passthrough[k] = v;
  }
  return passthrough;
}

function KeyValueEditor({
  value,
  onChange,
  theme,
  keyLabel = "Key",
  valueLabel = "Value",
  keyPlaceholder = "name",
  valuePlaceholder = "value",
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  theme: ReturnType<typeof useWorkflowTheme>["theme"];
  keyLabel?: string;
  valueLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [mode, setMode] = useState<"kv" | "json">("kv");
  const [jsonText, setJsonText] = useState(() => serializeJson(value));
  // Transient rows (e.g. a freshly added, still-empty key) live in local state — the stored
  // value only ever contains filled keys, so rows must not be derived from it alone.
  const [pairs, setPairs] = useState(() => toKeyValuePairs(value));
  const passthroughRef = useRef(extractPassthrough(value));
  const lastEmittedRef = useRef(snapshotValue(value));

  /** Re-sync local editing state from the stored value (node switch, template load, JSON edits). */
  const syncFrom = (v: unknown) => {
    lastEmittedRef.current = snapshotValue(v);
    setPairs(toKeyValuePairs(v));
    setJsonText(serializeJson(v));
    passthroughRef.current = extractPassthrough(v);
  };

  // Adopt external changes without clobbering in-progress edits (like an empty new row).
  useEffect(() => {
    if (snapshotValue(value) !== lastEmittedRef.current) syncFrom(value);
  }, [value]);

  const emitPairs = (next: Array<{ key: string; value: string }>) => {
    setPairs(next);
    const clean = { ...passthroughRef.current, ...fromKeyValuePairs(next) };
    lastEmittedRef.current = snapshotValue(clean);
    onChange(clean);
  };

  const updatePair = (index: number, field: "key" | "value", newVal: string) => {
    const updated = [...pairs];
    updated[index] = { ...updated[index], [field]: newVal };
    emitPairs(updated);
  };

  const addPair = () => {
    emitPairs([...pairs, { key: "", value: "" }]);
  };

  const removePair = (index: number) => {
    emitPairs(pairs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-1.5">
      {/* Mode toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => { setMode("kv"); syncFrom(value); }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${mode === "kv" ? "bg-flux-500/20 text-flux-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          <List className="w-2.5 h-2.5" /> Fields
        </button>
        <button
          onClick={() => { setMode("json"); syncFrom(value); }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${mode === "json" ? "bg-flux-500/20 text-flux-400" : "text-slate-500 hover:text-slate-300"}`}
        >
          <Braces className="w-2.5 h-2.5" /> JSON
        </button>
      </div>

      {mode === "kv" ? (
        <div className="space-y-1">
          {pairs.length > 0 && (
            <div className="flex items-center gap-1 px-1">
              <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-slate-600">{keyLabel}</span>
              <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-slate-600">{valueLabel}</span>
              <span className="w-5" />
            </div>
          )}
          {pairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                value={pair.key}
                onChange={(e) => updatePair(i, "key", e.target.value)}
                placeholder={keyPlaceholder}
                className="flex-1 rounded px-2 py-1.5 text-[11px] font-mono placeholder-slate-600 focus:outline-none transition-colors"
                style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
              />
              <input
                type="text"
                value={pair.value}
                onChange={(e) => updatePair(i, "value", e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1 rounded px-2 py-1.5 text-[11px] font-mono placeholder-slate-600 focus:outline-none transition-colors"
                style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
              />
              <button onClick={() => removePair(i)} className="text-slate-600 hover:text-red-400 transition-colors p-0.5 shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={addPair}
            className="flex items-center gap-1 text-[10px] text-flux-400 hover:text-flux-300 transition-colors mt-1"
          >
            <Plus className="w-3 h-3" /> Add {keyLabel.toLowerCase()}
          </button>
        </div>
      ) : (
        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value);
              lastEmittedRef.current = snapshotValue(parsed);
              passthroughRef.current = extractPassthrough(parsed);
              setPairs(toKeyValuePairs(parsed));
              onChange(parsed);
            } catch { /* wait for valid JSON */ }
          }}
          onBlur={() => {
            try {
              const parsed = JSON.parse(jsonText);
              lastEmittedRef.current = snapshotValue(parsed);
              passthroughRef.current = extractPassthrough(parsed);
              setPairs(toKeyValuePairs(parsed));
              onChange(parsed);
            } catch { /* keep raw text */ }
          }}
          placeholder='{"key": "value"}'
          rows={4}
          className="w-full rounded-lg px-3 py-2 text-[12px] placeholder-slate-500 focus:outline-none transition-all resize-none font-mono leading-relaxed"
          style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
        />
      )}
    </div>
  );
}

/**
 * Number field that tolerates intermediate text while typing ("-", "1.") and
 * supports negatives/decimals — a plain `Number(value) || 0` input resets those.
 */
function NumberInput({
  field,
  value,
  onChange,
  theme,
}: {
  field: NodeConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
  theme: ReturnType<typeof useWorkflowTheme>["theme"];
}) {
  const [raw, setRaw] = useState(() => String(value ?? ""));

  useEffect(() => {
    setRaw((current) => {
      const next = String(value ?? "");
      if (current === next) return current;
      const n = Number(current);
      // Keep an in-progress edit that still parses to the committed value ("1." vs 1).
      if (current.trim() !== "" && !Number.isNaN(n) && n === Number(value)) return current;
      return next;
    });
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={field.placeholder}
      onChange={(e) => {
        const text = e.target.value;
        setRaw(text);
        if (text.trim() === "" || text === "-") return;
        const n = Number(text);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = Number(raw);
        if (raw.trim() !== "" && !Number.isNaN(n)) onChange(n);
        else setRaw(String(value ?? ""));
      }}
      className="w-full rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none transition-all font-mono"
      style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
    />
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: NodeConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useWorkflowTheme();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: theme.nodeText }}>
          {field.label}
          {field.required && <span style={{ color: theme.accent }}>*</span>}
        </label>
        {field.description && (
          <button onClick={() => setExpanded(!expanded)} className="transition-colors" style={{ color: theme.nodeSubtext }}>
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && field.description && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <p className="text-[11px] mb-1.5 leading-relaxed" style={{ color: theme.nodeSubtext }}>{field.description}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {field.type === "text" && (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none transition-all"
          style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
        />
      )}

      {field.type === "number" && (
        <NumberInput field={field} value={value} onChange={onChange} theme={theme} />
      )}

      {field.type === "textarea" && (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="w-full rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none transition-all resize-none font-mono text-[13px] leading-relaxed"
          style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
        />
      )}

      {field.type === "select" && (
        <CustomSelect
          value={String(value ?? "")}
          options={field.options ?? []}
          onChange={onChange}
          theme={theme}
        />
      )}

      {field.type === "json" && (
        <KeyValueEditor
          value={value}
          onChange={onChange}
          theme={theme}
          keyLabel={field.key === "headers" ? "Header" : field.key === "rules" ? "Rule" : field.key === "conditions" ? "Condition" : "Key"}
          valueLabel={field.key === "headers" ? "Value" : field.key === "rules" ? "Output" : field.key === "conditions" ? "Value" : "Value"}
          keyPlaceholder={field.key === "headers" ? "Authorization" : field.key === "rules" ? "active" : field.key === "conditions" ? "status" : "name"}
          valuePlaceholder={field.key === "headers" ? "Bearer token" : field.key === "rules" ? "case1" : field.key === "conditions" ? "vip" : "value"}
        />
      )}

      {field.type === "toggle" && (
        <button
          onClick={() => onChange(!value)}
          className="relative w-10 h-5 rounded-full transition-colors duration-200"
          style={{ backgroundColor: value ? theme.accent : theme.nodeBorder }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-200"
            style={{ transform: value ? "translateX(20px)" : "" }}
          />
        </button>
      )}
    </div>
  );
}

export function NodeConfigPanel() {
  const { nodes, selectedNodeId, setSelectedNodeId, updateNodeConfig, updateNodeLabel, showToast } = useWorkflowStore();
  const { theme } = useWorkflowTheme();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const [activeTab, setActiveTab] = useState<"config" | "notes">("config");

  // Reset to the config tab when a different node is selected.
  useEffect(() => {
    setActiveTab("config");
  }, [selectedNodeId]);

  if (!selectedNode) return null;

  const nodeData = selectedNode.data as WorkflowNodeData;
  const item = nodeCatalog[nodeData.type];
  const Icon = item.icon;

  const handleDelete = () => {
    const { onNodesChange } = useWorkflowStore.getState();
    onNodesChange([{ id: selectedNode.id, type: "remove" }]);
    setSelectedNodeId(null);
    showToast("Node deleted", "info");
  };

  const handleDuplicate = () => {
    const { addNode } = useWorkflowStore.getState();
    addNode(nodeData.type, { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 });
    showToast("Node duplicated", "success");
  };

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
  const nc = nodeColorMap[nodeData.type] ?? { color: theme.accent, bg: theme.accentLight };

  return (
    <motion.aside
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="w-[320px] border-l flex flex-col shrink-0 h-full max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-40 max-sm:w-[min(320px,88vw)] max-sm:shadow-[-8px_0_28px_rgba(0,0,0,0.55)]"
      style={{ borderColor: theme.sidebarBorder, backgroundColor: theme.configPanelBg }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme.sidebarBorder}` }}>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: nc.bg, border: `1px solid ${nc.color}33` }}>
            <span style={{ color: nc.color }}><Icon className="w-4 h-4" /></span>
          </div>
          <div>
            <input
              value={nodeData.label}
              onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
              className="bg-transparent text-sm font-semibold focus:outline-none focus:ring-0 w-full"
              style={{ color: theme.nodeText }}
            />
            <p className="text-[11px]" style={{ color: theme.nodeSubtext }}>{item.label}</p>
          </div>
        </div>
        <button onClick={() => setSelectedNodeId(null)} className="p-1.5 rounded-lg transition-colors" style={{ color: theme.nodeSubtext }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: `1px solid ${theme.sidebarBorder}` }}>
        {(["config", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 px-4 py-2.5 text-xs font-medium capitalize transition-colors"
            style={{
              color: activeTab === tab ? theme.accent : theme.nodeSubtext,
              borderBottom: activeTab === tab ? `2px solid ${theme.accent}` : "2px solid transparent",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content — keyed by node so field-local state (rows, JSON drafts, info popovers)
          resets when switching nodes instead of leaking across them. */}
      <div key={selectedNode.id} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {activeTab === "config" &&
          item.configFields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={(nodeData.config as Record<string, unknown>)?.[field.key]}
              onChange={(v) => updateNodeConfig(selectedNode.id, field.key, v)}
            />
          ))}
        {activeTab === "notes" && (
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.nodeText }}>Node Notes</label>
            <textarea
              value={String((nodeData.config as Record<string, unknown>)?.["_notes"] ?? "")}
              onChange={(e) => updateNodeConfig(selectedNode.id, "_notes", e.target.value)}
              placeholder="Add notes about this node..."
              rows={6}
              className="w-full rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none transition-all resize-none"
              style={{ backgroundColor: theme.nodeConfigBg, border: `1px solid ${theme.nodeBorder}`, color: theme.nodeText }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${theme.sidebarBorder}` }}>
        <button
          onClick={handleDuplicate}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors"
          style={{ color: theme.nodeSubtext, border: `1px solid ${theme.nodeBorder}`, backgroundColor: theme.nodeConfigBg }}
        >
          <Copy className="w-3 h-3" /> Duplicate
        </button>
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 rounded-lg transition-colors border border-red-500/20 hover:bg-red-500/10"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.aside>
  );
}
