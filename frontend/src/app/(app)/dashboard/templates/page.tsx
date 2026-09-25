"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Server, Shield, GitBranch, TrendingUp, Users,
  ShoppingCart, DollarSign, Headphones, Zap, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { allTemplates, categories, subcategories, type BuilderTemplate } from "@/lib/templates-data";
import { saveNewWorkflow, updateWorkflowStatus, type WorkflowPayload } from "@/lib/workflow-api";
import { defaultNodeConfig } from "@/lib/template-defaults";

const categoryIconMap: Record<string, React.ElementType> = {
  "IT Ops": Server, "SecOps": Shield, "DevOps": GitBranch, "Sales": TrendingUp,
  "HR": Users, "E-Commerce": ShoppingCart, "Finance": DollarSign, "Support": Headphones,
};

const nodeColors: Record<string, string> = {
  trigger: "#10b981", http: "#38bdf8", ai: "#8b5cf6", condition: "#f59e0b",
  email: "#f472b6", database: "#2dd4bf", code: "#06b6d4", webhook: "#f97316",
  slack: "#a855f7", set: "#ec4899", merge: "#84cc16", split: "#c084fc",
  error: "#ef4444", delay: "#94a3b8", auth: "#34d399", document: "#f97316",
  filter: "#8b5cf6", approval: "#10b981", idempotency: "#06b6d4",
  loop: "#06b6d4", wait: "#94a3b8", switch: "#f59e0b",
};

function DocsModal({
  template,
  onClose,
  onUse,
}: {
  template: BuilderTemplate;
  onClose: () => void;
  onUse: (t: BuilderTemplate) => void;
}) {
  const [activeTab, setActiveTab] = useState<"steps" | "connections" | "prerequisites">("steps");
  const similarTemplates = allTemplates.filter(
    (t) => t.id !== template.id && (template.docs.similar.includes(t.id) || t.docs.similar.includes(template.id))
  ).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl glass border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-flux-400">
                  {template.category}
                </span>
                <span className="text-[10px] text-slate-500">/</span>
                <span className="text-[10px] text-slate-400">{template.subcategory}</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">{template.name}</h2>
              <p className="text-sm text-slate-400">{template.description}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-300 leading-relaxed mb-6">{template.docs.overview}</p>

          <div className="flex gap-1 p-1 rounded-xl bg-dark-800/50 border border-dark-700/50 mb-6">
            {(["steps", "connections", "prerequisites"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 text-xs font-medium rounded-lg transition-all capitalize ${
                  activeTab === tab ? "bg-flux-500/10 text-flux-400 border border-flux-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="space-y-3 mb-6">
            {activeTab === "steps" && template.docs.steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-flux-500/10 border border-flux-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-flux-400">{i + 1}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{step}</p>
              </div>
            ))}
            {activeTab === "connections" && template.docs.connections.map((conn, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-flux-400 shrink-0 mt-2" />
                <p className="text-sm text-slate-300 leading-relaxed">{conn}</p>
              </div>
            ))}
            {activeTab === "prerequisites" && template.docs.prerequisites.map((prereq, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-2" />
                <p className="text-sm text-slate-300 leading-relaxed">{prereq}</p>
              </div>
            ))}
          </div>

          {similarTemplates.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Similar Templates</h4>
              <div className="flex gap-2">
                {similarTemplates.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => { onUse(st); onClose(); }}
                    className="px-4 py-3 rounded-xl glass border border-white/5 text-left transition-all hover:border-flux-500/20"
                  >
                    <span className="text-xs font-medium text-white block">{st.name}</span>
                    <span className="text-[10px] text-slate-500">{st.nodes.length} nodes</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 flex items-center justify-between">
          <div className="text-xs text-slate-500">{template.nodes.length} nodes</div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button variant="primary" size="sm" onClick={() => { onUse(template); onClose(); }}>
              Use Template
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [docsTemplate, setDocsTemplate] = useState<BuilderTemplate | null>(null);

  const currentSubcats = activeCategory !== "All" ? (subcategories[activeCategory] ?? []) : [];

  const filtered = useMemo(() => {
    let list = activeCategory === "All" ? allTemplates : allTemplates.filter((t) => t.category === activeCategory);
    if (activeSub) list = list.filter((t) => t.subcategory === activeSub);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.subcategory.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, activeSub, searchQuery]);

  const handleUseTemplate = async (template: BuilderTemplate) => {
    setUsingTemplate(template.id);
    setTemplateError(null);
    try {
      const nodes = template.nodes.map((n) => ({
        id: crypto.randomUUID(),
        type: n.type,
        name: n.label,
        config: { ...defaultNodeConfig(n.type), ...(n.config ?? {}) } as Record<string, unknown>,
        position: n.position,
      }));
      const edges = template.edges.map((e) => ({
        id: crypto.randomUUID(),
        sourceNodeId: nodes[e.from].id,
        targetNodeId: nodes[e.to].id,
        sourceHandle: e.sourceHandle ?? "main",
        config: { branch: e.sourceHandle ?? "main" },
      }));
      const payload: WorkflowPayload = { name: template.name, nodes, edges };
      const response = await saveNewWorkflow(payload);
      // Webhook/cron triggers only fire while the workflow is ACTIVE (both the
      // webhook route and the scheduler filter on status) — activate here so
      // templates work out of the box instead of silently doing nothing.
      const entry = template.nodes.find((n) => n.type === "trigger");
      const triggerType =
        ((entry?.config as { triggerType?: string } | undefined)?.triggerType as string | undefined) ??
        (defaultNodeConfig("trigger").triggerType as string);
      if (triggerType === "webhook" || triggerType === "cron") {
        await updateWorkflowStatus(response.workflow.id, "ACTIVE");
      }
      router.push(`/workflows/${response.workflow.id}`);
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : "Could not create the workflow. Are you signed in?");
      setUsingTemplate(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Workflow Templates</h1>
        <p className="text-slate-400 text-sm sm:text-base">
          {allTemplates.length} pre-built workflows across {categories.length - 1} categories
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-4 mb-6"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-flux-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveSub(null); }}
            placeholder="Search templates..."
            className="input-premium w-full pl-11 pr-4 py-3 shadow-lg shadow-black/20"
          />
        </div>
      </motion.div>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-2 scrollbar-hide">
        {categories.map((cat) => {
          const Icon = cat !== "All" ? categoryIconMap[cat] : Zap;
          return (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setActiveSub(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                activeCategory === cat
                  ? "bg-flux-500/10 text-flux-400 border border-flux-500/30"
                  : "text-slate-400 hover:text-white hover:bg-dark-700/50 bg-dark-800/50 border border-dark-600/50"
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {cat}
              {cat !== "All" && (
                <span className="text-[9px] opacity-60 ml-0.5">
                  {allTemplates.filter((t) => t.category === cat).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {currentSubcats.length > 0 && !searchQuery && (
        <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {currentSubcats.map((sub) => (
            <button
              key={sub}
              onClick={() => setActiveSub(activeSub === sub ? null : sub)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                activeSub === sub
                  ? "bg-flux-500/10 text-flux-400 border border-flux-500/30"
                  : "text-slate-500 hover:text-slate-300 bg-dark-800/30 border border-dark-700/30"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {filtered.length} template{filtered.length !== 1 ? "s" : ""} found
        </p>
        {(activeCategory !== "All" || activeSub) && (
          <button
            onClick={() => { setActiveCategory("All"); setActiveSub(null); }}
            className="text-xs text-flux-400 hover:text-flux-300 transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      {templateError && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {templateError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <AnimatePresence mode="popLayout">
          {filtered.map((template, index) => {
            const Icon = categoryIconMap[template.category] || Zap;
            const isUsing = usingTemplate === template.id;
            const uniqueTypes = [...new Set(template.nodes.map((n) => n.type))];
            return (
              <motion.div
                key={template.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.03, duration: 0.4 }}
              >
                <div className="glass-card group p-5 rounded-2xl hover:border-flux-500/20 h-full flex flex-col">
                  <div className="h-1 rounded-t-2xl bg-gradient-to-r from-flux-500/50 via-flux-400/30 to-transparent -mt-5 mb-4" />
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-flux-500/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-flux-400" />
                      </div>
                      <div>
                        <span className="text-[10px] font-medium text-flux-400 block">{template.subcategory}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500">{template.nodes.length} nodes</span>
                  </div>

                  <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-flux-400 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4 flex-1">
                    {template.description}
                  </p>

                  <div className="flex items-center gap-1 mb-4">
                    {uniqueTypes.map((type) => (
                      <div
                        key={type}
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${nodeColors[type] ?? "#8b5cf6"}18, ${nodeColors[type] ?? "#8b5cf6"}08)`,
                          border: `1px solid ${nodeColors[type] ?? "#8b5cf6"}30`,
                        }}
                        title={type}
                      >
                        <span className="text-[8px] font-bold" style={{ color: nodeColors[type] ?? "#8b5cf6" }}>
                          {type.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-dark-700/50">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDocsTemplate(template)}
                      className="text-[11px] flex-1"
                    >
                      View Docs
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={isUsing}
                      onClick={() => handleUseTemplate(template)}
                      className="text-[11px] flex-1"
                    >
                      {isUsing ? (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          Use Template
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card text-center py-20"
        >
          <div className="w-20 h-20 rounded-2xl bg-dark-800 border border-dark-700 flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-slate-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No templates found</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Try adjusting your search or filter to find what you&apos;re looking for.
          </p>
          <Button variant="secondary" onClick={() => { setSearchQuery(""); setActiveCategory("All"); setActiveSub(null); }}>
            Reset Filters
          </Button>
        </motion.div>
      )}

      <AnimatePresence>
        {docsTemplate && (
          <DocsModal
            template={docsTemplate}
            onClose={() => setDocsTemplate(null)}
            onUse={handleUseTemplate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
