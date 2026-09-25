"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight, Zap, Brain, GitBranch, Shield, Clock, Database,
  Code, Webhook, Eye, Server, Terminal, GitPullRequest,
  TrendingUp, ShoppingCart, DollarSign, Headphones, Users,
  Layers, Play, CheckCircle2, Lock, Fingerprint, Globe, Mail,
  MessageSquare, FileText, Shuffle, Merge, Split as SplitIcon,
  AlertTriangle, Repeat, FileSearch, Filter,
  Workflow as WorkflowIcon,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { HeroCanvas } from "@/components/hero-canvas";
import { SeaWaves } from "@/components/sea-waves";
import { FluxOrb } from "@/components/flux-orb";
import { allTemplates, categories } from "@/lib/templates-data";
import { nodeCatalog, type WorkflowNodeType } from "@/components/workflow-types";

/* ─── Real numbers, straight from the codebase ─────────────────────────── */

const TEMPLATE_COUNT = allTemplates.length;
const NODE_TYPE_COUNT = Object.keys(nodeCatalog).length;
const CATEGORY_COUNT = categories.filter((c) => c !== "All").length;

const CATEGORY_ICON: Record<string, LucideIcon> = {
  "IT Ops": Server,
  SecOps: Shield,
  DevOps: GitPullRequest,
  Sales: TrendingUp,
  HR: Users,
  "E-Commerce": ShoppingCart,
  Finance: DollarSign,
  Support: Headphones,
};

/* Bundled category shots — one per use-case category (public/landing/*) */
const CATEGORY_IMAGE: Record<string, string> = {
  "IT Ops": "/landing/ITOps.png",
  SecOps: "/landing/SecOps.png",
  DevOps: "/landing/DevOps.png",
  Sales: "/landing/sales.jpeg",
  HR: "/landing/HR.png",
  "E-Commerce": "/landing/E-Commerce.png",
  Finance: "/landing/Finance.png",
  Support: "/landing/Support.png",
};

/* Average edge colour of each photo, so the letterbox frame blends into the
   image seamlessly (sampled from the files in public/landing). */
const CATEGORY_BG: Record<string, string> = {
  "IT Ops": "#090c14",
  SecOps: "#0b0e14",
  DevOps: "#1b1c1e",
  Sales: "#0d141c",
  HR: "#0f111a",
  "E-Commerce": "#0c1116",
  Finance: "#0e1217",
  Support: "#0d1217",
};

/* ═══════════════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════════════ */
function Hero() {
  const { data: session } = useSession();

  return (
    <section className="relative pt-24 sm:pt-32 pb-0 px-6 overflow-hidden">
      {/* Ambient glow field */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full blur-[140px] opacity-[0.18]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 65%)" }}
        />
        <div
          className="absolute top-40 left-1/4 w-[500px] h-[500px] rounded-full blur-[130px] opacity-[0.12]"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 65%)" }}
        />
        <div
          className="absolute top-60 right-1/4 w-[500px] h-[500px] rounded-full blur-[130px] opacity-[0.10]"
          style={{ background: "radial-gradient(circle, #d946ef 0%, transparent 65%)" }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          {/* Left — pitch + CTAs */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6 sm:mb-8"
              style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.25)" }}
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-flux-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-flux-400" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-flux-200 tracking-wide">
                Open-source automation · {TEMPLATE_COUNT} ready-made templates
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 60, damping: 15 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.06]"
            >
              <span className="text-white">Workflows you can</span>
              <br />
              <span className="gradient-text-hero">see and control</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8 sm:mb-10 leading-relaxed"
            >
              Build visually, go deep with code, connect to anything. Every step of your
              agents&apos; reasoning, traceable on the canvas. Run it on your infrastructure or ours.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3 sm:gap-4"
            >
              <Link
                href={session ? "/dashboard" : "/register"}
                className="btn-pill group w-full sm:w-auto"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {session ? "Go to Dashboard" : "Get started for free"}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <Link
                href="/dashboard/templates"
                className="btn-pill-ghost w-full sm:w-auto"
              >
                Browse Templates
              </Link>
            </motion.div>
          </div>

          {/* Right — animated FluX mark */}
          <div className="relative flex justify-center lg:justify-end">
            <FluxOrb />
          </div>
        </div>

        {/* Product visual */}
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.45, type: "spring", stiffness: 45, damping: 18 }}
          className="hidden sm:block relative mt-6 sm:mt-12 max-w-5xl mx-auto"
        >
          <div className="absolute -inset-8 rounded-3xl bg-gradient-to-r from-flux-600/20 via-indigo-600/15 to-blue-600/20 blur-3xl" />
            <HeroCanvas />
        </motion.div>
      </div>

      {/* Sea waves at the hero bottom */}
      <div className="relative mt-14 -mx-6 -mb-px">
        <SeaWaves />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   USE CASES — "Workflows for every team" (tabbed, real templates)
   ═══════════════════════════════════════════════════════════════════════ */
function UseCases() {
  const cats = categories.filter((c) => c !== "All");
  const [active, setActive] = useState(cats[0]);

  const templates = allTemplates.filter((t) => t.category === active);

  return (
    <section id="use-cases" className="pt-12 pb-20 px-6 relative scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 60, damping: 15 }}
          className="text-center mb-8 md:mb-12"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Automation for <span className="gradient-text">every team</span>
          </h2>
          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
            {TEMPLATE_COUNT} production-ready workflows across {CATEGORY_COUNT} categories — pick one and run it.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 md:mb-10 overflow-x-auto no-scrollbar flex-nowrap md:flex-wrap justify-start md:justify-center -mx-6 px-6 md:mx-0 md:px-0 pb-1">
          {cats.map((c) => {
            const TabIcon = CATEGORY_ICON[c] ?? WorkflowIcon;
            const isActive = c === active;
            return (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={`flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  isActive ? "text-white" : "text-slate-500 hover:text-slate-300"
                }`}
                style={
                  isActive
                    ? { background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.14))", border: "1px solid rgba(139,92,246,0.45)" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }
                }
              >
                <TabIcon className="w-3.5 h-3.5" style={isActive ? { color: "#a78bfa" } : undefined} />
                {c}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid lg:grid-cols-5 gap-5"
          >
            {/* Category photo — full and uncropped (object-contain). On lg the
                card carries no intrinsic height, so the grid row takes the right
                column's height and the photo simply fills it, perfectly framed. */}
            <div
              className="lg:col-span-3 rounded-2xl relative overflow-hidden h-72 sm:h-96 lg:h-auto"
              style={{ background: CATEGORY_BG[active] ?? "#0b0e16", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Image
                src={CATEGORY_IMAGE[active] ?? "/landing/ITOps.png"}
                alt={`${active} automation imagery`}
                fill
                sizes="(max-width: 1024px) 100vw, 640px"
                className="object-contain"
                priority={active === cats[0]}
              />
            </div>

            {/* All templates in this category — cards flex to fill the row
                height, so this column always matches the photo container */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {templates.map((t) => {
                const CardIcon = CATEGORY_ICON[t.category] ?? WorkflowIcon;
                return (
                  <Link
                    key={t.id}
                    href="/dashboard/templates"
                    className="group rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 block overflow-hidden relative flex-1 flex items-center"
                    style={{ background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-start gap-3.5 w-full">
                      <div
                        className="relative w-24 h-20 rounded-lg overflow-hidden shrink-0"
                        style={{ background: CATEGORY_BG[t.category] ?? "#0b0e16" }}
                      >
                        <Image
                          src={CATEGORY_IMAGE[t.category] ?? "/landing/ITOps.png"}
                          alt={`${t.category} automation imagery`}
                          fill
                          sizes="96px"
                          className="object-contain transition-transform duration-700 group-hover:scale-110"
                        />
                        <div
                          className="absolute inset-0"
                          style={{ background: "linear-gradient(180deg, rgba(11,14,22,0), rgba(11,14,22,0.4))" }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <CardIcon className="w-3 h-3 text-flux-400 shrink-0" />
                          <h4 className="text-sm font-semibold text-white group-hover:text-flux-200 transition-colors truncate">
                            {t.name}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{t.description}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
              <div
                className="rounded-2xl p-5 flex items-center justify-between shrink-0"
                style={{ background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.18)" }}
              >
                <span className="text-sm text-slate-400">
                  <span className="text-white font-semibold">
                    {allTemplates.filter((t) => t.category === active).length}
                  </span>{" "}
                  workflows in {active}
                </span>
                <Link
                  href="/dashboard/templates"
                  className="text-[11px] font-medium text-flux-400 hover:text-flux-300 transition-colors flex items-center gap-1"
                >
                  All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─── Node flow metadata (real node colors/icons) ──────────────────────── */

const NODE_FLOW_META: Record<string, { color: string; icon: LucideIcon }> = {
  trigger: { color: "#34d399", icon: Zap },
  http: { color: "#38bdf8", icon: Globe },
  ai: { color: "#a78bfa", icon: Brain },
  condition: { color: "#fbbf24", icon: GitBranch },
  email: { color: "#f472b6", icon: Mail },
  database: { color: "#2dd4bf", icon: Database },
  code: { color: "#22d3ee", icon: Code },
  webhook: { color: "#fb923c", icon: Webhook },
  slack: { color: "#c084fc", icon: MessageSquare },
  delay: { color: "#94a3b8", icon: Clock },
  wait: { color: "#7dd3fc", icon: Clock },
  set: { color: "#f9a8d4", icon: FileText },
  switch: { color: "#818cf8", icon: Shuffle },
  merge: { color: "#84cc16", icon: Merge },
  split: { color: "#d946ef", icon: SplitIcon },
  error: { color: "#f87171", icon: AlertTriangle },
  auth: { color: "#34d399", icon: Lock },
  loop: { color: "#22d3ee", icon: Repeat },
  document: { color: "#f97316", icon: FileSearch },
  filter: { color: "#8b5cf6", icon: Filter },
  approval: { color: "#10b981", icon: CheckCircle2 },
  idempotency: { color: "#06b6d4", icon: Fingerprint },
};

function flowMeta(type: string) {
  return NODE_FLOW_META[type] ?? { color: "#a78bfa", icon: Code };
}

/* ═══════════════════════════════════════════════════════════════════════
   STATS BAND — every number is computed from the real codebase
   ═══════════════════════════════════════════════════════════════════════ */
function StatsBand() {
  const stats = [
    { value: TEMPLATE_COUNT, label: "Workflow templates", icon: WorkflowIcon, color: "#a78bfa" },
    { value: NODE_TYPE_COUNT, label: "Built-in node types", icon: Layers, color: "#38bdf8" },
    { value: CATEGORY_COUNT, label: "Industry categories", icon: Server, color: "#34d399" },
    { value: 3, label: "Trigger types", icon: Zap, color: "#fbbf24" },
  ];
  return (
    <section className="py-8 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-2xl p-5 text-center"
            style={{ background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="absolute -top-6 -right-6 w-16 h-16 rounded-full blur-2xl opacity-20"
              style={{ backgroundColor: s.color }}
            />
            <s.icon className="w-4 h-4 mb-2 mx-auto relative" style={{ color: s.color }} />
            <p className="text-3xl font-bold text-white font-mono relative">{s.value}</p>
            <p className="text-[10px] text-slate-500 relative mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INTEGRATIONS — marquee of every real node type
   ═══════════════════════════════════════════════════════════════════════ */
function Integrations() {
  const entries = Object.entries(nodeCatalog) as Array<[WorkflowNodeType, (typeof nodeCatalog)[WorkflowNodeType]]>;
  const rowA = entries.slice(0, 11);
  const rowB = entries.slice(11);

  const Chip = ({ type, label }: { type: string; label: string }) => {
    const meta = flowMeta(type);
    const Icon = meta.icon;
    return (
      <div
        className="flex items-center gap-2.5 px-5 py-3 rounded-xl shrink-0"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${meta.color}1c`, border: `1px solid ${meta.color}38` }}
        >
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
        </span>
        <span className="text-sm font-medium text-slate-300 whitespace-nowrap">{label}</span>
      </div>
    );
  };

  return (
    <section id="integrations" className="pt-12 pb-20 px-6 relative scroll-mt-16 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 60, damping: 15 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Connect to <span className="gradient-text">anything</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            {NODE_TYPE_COUNT} built-in node types for common apps and protocols — and a Code node for everything else.
          </p>
        </motion.div>
      </div>

      {/* Marquee rows */}
      <div className="relative">
        {/* Edge fades */}
        <div
          className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{ background: "linear-gradient(90deg, #030508, transparent)" }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{ background: "linear-gradient(270deg, #030508, transparent)" }}
        />
        <div className="flex gap-3 marquee-row mb-3">
          {[...rowA, ...rowA].map(([type, entry], i) => (
            <Chip key={`${type}-${i}`} type={type} label={entry.label} />
          ))}
        </div>
        <div className="flex gap-3 marquee-row-reverse">
          {[...rowB, ...rowB].map(([type, entry], i) => (
            <Chip key={`${type}-${i}`} type={type} label={entry.label} />
          ))}
        </div>
      </div>

      <div className="text-center mt-10">
        <Link
          href="/workflows"
          className="btn-pill-ghost"
        >
          Explore the full node catalog
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   AI AGENTS — real model support, human-in-the-loop
   ═══════════════════════════════════════════════════════════════════════ */
function AIAgents() {
  return (
    <section id="features" className="pt-12 pb-20 px-6 relative scroll-mt-16 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(180deg, transparent, rgba(124,58,237,0.05), transparent)" }}
      />
      <div className="max-w-6xl mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 60, damping: 15 }}
          >
            <p className="text-flux-400 text-sm font-semibold uppercase tracking-[0.2em] mb-3">AI orchestration</p>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Build AI agents you can<br className="hidden md:block" />{" "}
              <span className="gradient-text">actually follow</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Connect any model. Inspect every decision. Keep humans in the loop. Every prompt,
              response, token count, and timing is captured in the execution trace.
            </p>
            <div className="flex flex-col gap-4">
              {[
                {
                  icon: Brain,
                  title: "Any provider, one canvas",
                  desc: "OpenAI, Anthropic, and Google Gemini — all routed through OpenRouter. Swap models without rebuilding workflows.",
                },
                {
                  icon: CheckCircle2,
                  title: "Structured outputs",
                  desc: "Force JSON responses, tune temperature, and reference any node's output with {{nodeId.output}} templating.",
                },
                {
                  icon: Eye,
                  title: "Inspect every execution",
                  desc: "See the exact prompt, the raw response, and what happened next — per node, in real time.",
                },
              ].map((f) => (
                <div key={f.title} className="flex gap-4">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)" }}
                  >
                    <f.icon className="w-5 h-5 text-flux-300" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">{f.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Model picker mock — reflects the real config panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 60, damping: 15 }}
            className="relative"
          >
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-flux-600/15 to-blue-600/10 blur-3xl" />
            <div
              className="relative rounded-2xl p-6"
              style={{ background: "linear-gradient(180deg, rgba(17,24,39,0.9), rgba(11,14,22,0.9))", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <div className="flex items-center gap-2.5 mb-5">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(167,139,250,0.16)", border: "1px solid rgba(167,139,250,0.4)" }}
                >
                  <Brain className="w-4.5 h-4.5 text-violet-300" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">AI Model</p>
                  <p className="text-[10px] text-slate-600 font-mono">node · ai-triage</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2 block">
                    Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["OpenAI", "Anthropic", "Gemini"].map((p, i) => (
                      <div
                        key={p}
                        className="text-center py-2.5 rounded-lg text-[11px] font-medium transition-all"
                        style={
                          i === 0
                            ? { background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.5)", color: "#e9d5ff" }
                            : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#94a3b8" }
                        }
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2 block">
                    Model
                  </label>
                  <div
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-[12px] text-slate-200 font-mono">gpt-4o-mini</span>
                    <span className="text-[10px] text-slate-600">fast · cheap</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-2 block">
                    Prompt
                  </label>
                  <div
                    className="px-3.5 py-3 rounded-lg font-mono text-[11px] text-slate-400 leading-relaxed"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <span className="text-slate-600">{"// "}</span>Triage this alert. Return severity as JSON.
                    <br />
                    <span className="text-violet-300">{"{{trigger.body}}"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-4 rounded-full bg-flux-500/40 relative">
                      <span className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-flux-300" />
                    </span>
                    <span className="text-[11px] text-slate-400">JSON output</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono">~0.8s · 412 tokens</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   "CODE WHEN YOU NEED IT" + "MOVE FAST" — paired feature blocks
   ═══════════════════════════════════════════════════════════════════════ */
function CodeAndSpeed() {
  return (
    <section className="pt-12 pb-20 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Code node */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 60, damping: 15 }}
            className="rounded-2xl p-8 relative overflow-hidden"
            style={{ background: "linear-gradient(180deg, rgba(17,24,39,0.6), rgba(11,14,22,0.6))", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
              style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)" }}
            >
              <Terminal className="w-5.5 h-5.5 text-cyan-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Code when you need it</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              Other tools make you choose between a visual builder or code. With FluX you get both —
              a JavaScript Code node drops in anywhere, with inputs and outputs visible right next to the settings.
            </p>
            <div
              className="rounded-lg p-4 font-mono text-[11px] leading-relaxed"
              style={{ background: "rgba(3,5,8,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="text-slate-600 mb-1.5">{"// transform the payload"}</div>
              <div>
                <span className="text-violet-300">return</span> items
                <span className="text-slate-500">.</span>
                <span className="text-cyan-300">map</span>
                <span className="text-slate-400">(</span>x <span className="text-violet-300">=&gt;</span>
                <span className="text-slate-400">{" {"}</span>
              </div>
              <div className="pl-4">
                <span className="text-slate-400">...x,</span>
              </div>
              <div className="pl-4">
                <span className="text-emerald-300">flagged</span>
                <span className="text-slate-400">: x.score </span>
                <span className="text-violet-300">&gt;</span>
                <span className="text-slate-400"> </span>
                <span className="text-amber-300">0.8</span>
                <span className="text-slate-400">,</span>
              </div>
              <div className="text-slate-400">{"});"}</div>
            </div>
          </motion.div>

          {/* Move fast */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.1 }}
            className="rounded-2xl p-8 relative overflow-hidden"
            style={{ background: "linear-gradient(180deg, rgba(17,24,39,0.6), rgba(11,14,22,0.6))", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
              style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)" }}
            >
              <Zap className="w-5.5 h-5.5 text-emerald-300" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Move fast. Break nothing.</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              Short feedback loops that keep you in the flow — from first draft to production traffic.
            </p>
            <div className="flex flex-col gap-3.5">
              {[
                { icon: Play, title: "Test with real data", desc: "Run a single node or the whole workflow with live payloads." },
                { icon: Clock, title: "Durable waits", desc: "Pause for minutes or months — state persists, then resumes exactly where it left off." },
                { icon: Eye, title: "Live execution map", desc: "Watch each node fire in real time, with inputs, outputs, and errors per step." },
                { icon: AlertTriangle, title: "Fail loud, recover fast", desc: "Error-handler branches and retry logic, not silent dead ends." },
              ].map((f) => (
                <div key={f.title} className="flex gap-3.5">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <f.icon className="w-4 h-4 text-slate-300" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{f.title}</p>
                    <p className="text-[11.5px] text-slate-500 leading-relaxed mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ENTERPRISE — real security primitives
   ═══════════════════════════════════════════════════════════════════════ */
function Enterprise() {
  const items = [
    {
      icon: Lock,
      title: "Auth gates",
      desc: "Require valid API keys or credentials before a workflow proceeds.",
    },
    {
      icon: Fingerprint,
      title: "Idempotency guards",
      desc: "Prevent duplicate processing when webhooks fire twice.",
    },
    {
      icon: Shield,
      title: "SSRF protection",
      desc: "Private network targets are blocked unless you explicitly opt in.",
    },
    {
      icon: Database,
      title: "Database policy",
      desc: "Raw queries are scoped and internal tables are off-limits.",
    },
    {
      icon: CheckCircle2,
      title: "Human approval",
      desc: "Pause for sign-off before sensitive actions run.",
    },
    {
      icon: Server,
      title: "Distributed mode",
      desc: "Scale across workers over Kafka, or run everything in-process.",
    },
  ];

  return (
    <section id="enterprise" className="pt-12 pb-20 px-6 relative scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 60, damping: 15 }}
          className="text-center mb-14"
        >
          <p className="text-flux-400 text-sm font-semibold uppercase tracking-[0.2em] mb-3">Enterprise-ready</p>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Reliable. Scalable. <span className="gradient-text">Secure.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Security and governance baked into the engine — so you can automate in production without losing control.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.08, type: "spring", stiffness: 80, damping: 16 }}
              whileHover={{ y: -4 }}
              className="relative overflow-hidden rounded-2xl p-6 group"
              style={{ background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-3xl opacity-15 group-hover:opacity-30 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }}
              />
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 relative"
                style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.28)" }}
              >
                <it.icon className="w-5 h-5 text-flux-300" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2 relative">{it.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed relative">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CTA
   ═══════════════════════════════════════════════════════════════════════ */
function CTA() {
  const { data: session } = useSession();
  return (
    <section className="pt-16 pb-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[420px] rounded-full blur-[140px] opacity-[0.18]"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 65%)" }}
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
        className="max-w-3xl mx-auto text-center relative"
      >
        <div
          className="relative rounded-3xl p-8 sm:p-12 md:p-16 overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.12) 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
          />
          <h2 className="relative text-3xl md:text-5xl font-bold text-white mb-4 leading-tight">
            Simple enough to see.<br />
            <span className="gradient-text">Powerful enough to ship.</span>
          </h2>
          <p className="relative text-slate-400 text-base sm:text-lg mb-7 sm:mb-9">
            Join the teams building automation they can actually explain.
          </p>
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="relative inline-block w-full sm:w-auto">
            <Link
              href={session ? "/dashboard" : "/register"}
              className="btn-pill w-full sm:w-auto"
            >
              {session ? "Go to Dashboard" : "Start building free"}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
          {!session && (
            <p className="relative text-xs text-slate-600 mt-5">No credit card required · open source</p>
          )}
        </div>
      </motion.div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-dark-950">
      <Hero />
      <StatsBand />
      <UseCases />
      <Integrations />
      <AIAgents />
      <CodeAndSpeed />
      <Enterprise />
      <CTA />
    </div>
  );
}

