"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Moon, Waves, Sun, Leaf, Flame, Snowflake } from "lucide-react";

export type NodeColors = {
  trigger: string;
  triggerBg: string;
  http: string;
  httpBg: string;
  ai: string;
  aiBg: string;
  condition: string;
  conditionBg: string;
  email: string;
  emailBg: string;
  database: string;
  databaseBg: string;
  code: string;
  codeBg: string;
  webhook: string;
  webhookBg: string;
  delay: string;
  delayBg: string;
  set: string;
  setBg: string;
  switch: string;
  switchBg: string;
  merge: string;
  mergeBg: string;
  split: string;
  splitBg: string;
  error: string;
  errorBg: string;
  auth: string;
  authBg: string;
  slack: string;
  slackBg: string;
  loop: string;
  loopBg: string;
  wait: string;
  waitBg: string;
  document: string;
  documentBg: string;
  filter: string;
  filterBg: string;
  approval: string;
  approvalBg: string;
  idempotency: string;
  idempotencyBg: string;
};

export type CanvasPattern = "dots" | "grid" | "cells" | "crosshatch" | "mesh" | "none";

export type WorkflowTheme = {
  id: string;
  name: string;
  icon: typeof Moon;
  canvas: string;
  canvasPattern: CanvasPattern;
  patternColor: string;
  patternSize: number;
  patternGap: number;
  nodeColors: NodeColors;
  nodeBg: string;
  nodeBorder: string;
  nodeBorderSelected: string;
  nodeText: string;
  nodeSubtext: string;
  nodeConfigBg: string;
  nodeGlow: string;
  sidebarBg: string;
  sidebarBorder: string;
  headerBg: string;
  headerBorder: string;
  accent: string;
  accentHue: string;
  accentLight: string;
  minimapMask: string;
  configPanelBg: string;
  edgeColor: string;
  edgeActive: string;
  canvasNoise: number;
};

const triggerNodeColors = {
  trigger: "#10b981",
  triggerBg: "rgba(16, 185, 129, 0.12)",
  http: "#38bdf8",
  httpBg: "rgba(56, 189, 248, 0.12)",
  ai: "#a78bfa",
  aiBg: "rgba(167, 139, 250, 0.12)",
  condition: "#fbbf24",
  conditionBg: "rgba(251, 191, 36, 0.12)",
  email: "#f472b6",
  emailBg: "rgba(244, 114, 182, 0.12)",
  database: "#2dd4bf",
  databaseBg: "rgba(45, 212, 191, 0.12)",
  code: "#22d3ee",
  codeBg: "rgba(34, 211, 238, 0.12)",
  webhook: "#fb923c",
  webhookBg: "rgba(251, 146, 60, 0.12)",
  delay: "#94a3b8",
  delayBg: "rgba(148, 163, 184, 0.12)",
  set: "#e879f9",
  setBg: "rgba(232, 121, 249, 0.12)",
  switch: "#818cf8",
  switchBg: "rgba(129, 140, 248, 0.12)",
  merge: "#4ade80",
  mergeBg: "rgba(74, 222, 128, 0.12)",
  split: "#c084fc",
  splitBg: "rgba(192, 132, 252, 0.12)",
  error: "#f87171",
  errorBg: "rgba(248, 113, 113, 0.12)",
  auth: "#34d399",
  authBg: "rgba(52, 211, 153, 0.12)",
  slack: "#a855f7",
  slackBg: "rgba(168, 85, 247, 0.12)",
  loop: "#06b6d4",
  loopBg: "rgba(6, 182, 212, 0.12)",
  wait: "#94a3b8",
  waitBg: "rgba(148, 163, 184, 0.12)",
  document: "#f97316",
  documentBg: "rgba(249, 115, 22, 0.12)",
  filter: "#8b5cf6",
  filterBg: "rgba(139, 92, 246, 0.12)",
  approval: "#10b981",
  approvalBg: "rgba(16, 185, 129, 0.12)",
  idempotency: "#06b6d4",
  idempotencyBg: "rgba(6, 182, 212, 0.12)",
};

const slateNodeColors = {
  trigger: "#34d399",
  triggerBg: "rgba(52, 211, 153, 0.1)",
  http: "#60a5fa",
  httpBg: "rgba(96, 165, 250, 0.1)",
  ai: "#c084fc",
  aiBg: "rgba(192, 132, 252, 0.1)",
  condition: "#fbbf24",
  conditionBg: "rgba(251, 191, 36, 0.1)",
  email: "#f472b6",
  emailBg: "rgba(244, 114, 182, 0.1)",
  database: "#2dd4bf",
  databaseBg: "rgba(45, 212, 191, 0.1)",
  code: "#67e8f9",
  codeBg: "rgba(103, 232, 249, 0.1)",
  webhook: "#fb923c",
  webhookBg: "rgba(251, 146, 60, 0.1)",
  delay: "#cbd5e1",
  delayBg: "rgba(203, 213, 225, 0.1)",
  set: "#e879f9",
  setBg: "rgba(232, 121, 249, 0.1)",
  switch: "#a5b4fc",
  switchBg: "rgba(165, 180, 252, 0.1)",
  merge: "#86efac",
  mergeBg: "rgba(134, 239, 172, 0.1)",
  split: "#d8b4fe",
  splitBg: "rgba(216, 180, 254, 0.1)",
  error: "#fca5a5",
  errorBg: "rgba(252, 165, 165, 0.1)",
  auth: "#6ee7b7",
  authBg: "rgba(110, 231, 183, 0.1)",
  slack: "#a855f7",
  slackBg: "rgba(168, 85, 247, 0.12)",
  loop: "#06b6d4",
  loopBg: "rgba(6, 182, 212, 0.12)",
  wait: "#94a3b8",
  waitBg: "rgba(148, 163, 184, 0.12)",
  document: "#f97316",
  documentBg: "rgba(249, 115, 22, 0.1)",
  filter: "#8b5cf6",
  filterBg: "rgba(139, 92, 246, 0.1)",
  approval: "#10b981",
  approvalBg: "rgba(16, 185, 129, 0.1)",
  idempotency: "#06b6d4",
  idempotencyBg: "rgba(6, 182, 212, 0.1)",
};

export const themes: WorkflowTheme[] = [
  {
    id: "void",
    name: "Void",
    icon: Moon,
    canvas: "#08080c",
    canvasPattern: "dots",
    patternColor: "rgba(100, 116, 139, 0.15)",
    patternSize: 1,
    patternGap: 24,
    nodeColors: triggerNodeColors,
    nodeBg: "rgba(20, 20, 28, 0.95)",
    nodeBorder: "rgba(50, 50, 70, 0.8)",
    nodeBorderSelected: "rgba(249, 115, 22, 0.8)",
    nodeText: "#f1f5f9",
    nodeSubtext: "#64748b",
    nodeConfigBg: "rgba(30, 30, 42, 0.8)",
    nodeGlow: "rgba(249, 115, 22, 0.15)",
    sidebarBg: "rgba(12, 12, 18, 0.98)",
    sidebarBorder: "rgba(50, 50, 70, 0.5)",
    headerBg: "rgba(12, 12, 18, 0.9)",
    headerBorder: "rgba(50, 50, 70, 0.5)",
    accent: "#f97316",
    accentHue: "249, 115, 22",
    accentLight: "rgba(249, 115, 22, 0.12)",
    minimapMask: "rgba(8, 8, 12, 0.8)",
    configPanelBg: "rgba(12, 12, 18, 0.98)",
    edgeColor: "rgba(100, 116, 139, 0.3)",
    edgeActive: "rgba(249, 115, 22, 0.6)",
    canvasNoise: 0.03,
  },
  {
    id: "ocean",
    name: "Deep Ocean",
    icon: Waves,
    canvas: "#04101c",
    canvasPattern: "cells",
    patternColor: "rgba(56, 189, 248, 0.12)",
    patternSize: 1,
    patternGap: 32,
    nodeColors: slateNodeColors,
    nodeBg: "rgba(8, 24, 42, 0.95)",
    nodeBorder: "rgba(30, 64, 100, 0.6)",
    nodeBorderSelected: "rgba(56, 189, 248, 0.8)",
    nodeText: "#e2e8f0",
    nodeSubtext: "#6494b8",
    nodeConfigBg: "rgba(15, 35, 55, 0.8)",
    nodeGlow: "rgba(56, 189, 248, 0.12)",
    sidebarBg: "rgba(4, 14, 26, 0.98)",
    sidebarBorder: "rgba(30, 64, 100, 0.4)",
    headerBg: "rgba(4, 14, 26, 0.9)",
    headerBorder: "rgba(30, 64, 100, 0.4)",
    accent: "#38bdf8",
    accentHue: "56, 189, 248",
    accentLight: "rgba(56, 189, 248, 0.12)",
    minimapMask: "rgba(4, 16, 28, 0.8)",
    configPanelBg: "rgba(4, 14, 26, 0.98)",
    edgeColor: "rgba(56, 189, 248, 0.2)",
    edgeActive: "rgba(56, 189, 248, 0.6)",
    canvasNoise: 0.02,
  },
  {
    id: "aurora",
    name: "Aurora",
    icon: Snowflake,
    canvas: "#0c0a1a",
    canvasPattern: "mesh",
    patternColor: "rgba(168, 85, 247, 0.12)",
    patternSize: 1,
    patternGap: 28,
    nodeColors: {
      ...triggerNodeColors,
      trigger: "#c084fc",
      triggerBg: "rgba(192, 132, 252, 0.12)",
      ai: "#e879f9",
      aiBg: "rgba(232, 121, 249, 0.12)",
      http: "#818cf8",
      httpBg: "rgba(129, 140, 248, 0.12)",
    },
    nodeBg: "rgba(18, 12, 35, 0.95)",
    nodeBorder: "rgba(80, 60, 120, 0.5)",
    nodeBorderSelected: "rgba(168, 85, 247, 0.8)",
    nodeText: "#f5f3ff",
    nodeSubtext: "#8b7fad",
    nodeConfigBg: "rgba(28, 20, 50, 0.8)",
    nodeGlow: "rgba(168, 85, 247, 0.15)",
    sidebarBg: "rgba(10, 8, 20, 0.98)",
    sidebarBorder: "rgba(80, 60, 120, 0.4)",
    headerBg: "rgba(10, 8, 20, 0.9)",
    headerBorder: "rgba(80, 60, 120, 0.4)",
    accent: "#a855f7",
    accentHue: "168, 85, 247",
    accentLight: "rgba(168, 85, 247, 0.12)",
    minimapMask: "rgba(12, 10, 26, 0.8)",
    configPanelBg: "rgba(10, 8, 20, 0.98)",
    edgeColor: "rgba(168, 85, 247, 0.2)",
    edgeActive: "rgba(168, 85, 247, 0.6)",
    canvasNoise: 0.04,
  },
  {
    id: "solar",
    name: "Solar Light",
    icon: Sun,
    canvas: "#f5f5f4",
    canvasPattern: "grid",
    patternColor: "rgba(120, 113, 108, 0.12)",
    patternSize: 1,
    patternGap: 20,
    nodeColors: {
      trigger: "#059669",
      triggerBg: "rgba(5, 150, 105, 0.1)",
      http: "#2563eb",
      httpBg: "rgba(37, 99, 235, 0.1)",
      ai: "#7c3aed",
      aiBg: "rgba(124, 58, 237, 0.1)",
      condition: "#d97706",
      conditionBg: "rgba(217, 119, 6, 0.1)",
      email: "#db2777",
      emailBg: "rgba(219, 39, 119, 0.1)",
      database: "#0d9488",
      databaseBg: "rgba(13, 148, 136, 0.1)",
      code: "#0891b2",
      codeBg: "rgba(8, 145, 178, 0.1)",
      webhook: "#ea580c",
      webhookBg: "rgba(234, 88, 12, 0.1)",
      delay: "#6b7280",
      delayBg: "rgba(107, 114, 128, 0.1)",
      set: "#c026d3",
      setBg: "rgba(192, 38, 211, 0.1)",
      switch: "#4f46e5",
      switchBg: "rgba(79, 70, 229, 0.1)",
      merge: "#16a34a",
      mergeBg: "rgba(22, 163, 74, 0.1)",
      split: "#9333ea",
      splitBg: "rgba(147, 51, 234, 0.1)",
      error: "#dc2626",
      errorBg: "rgba(220, 38, 38, 0.1)",
      auth: "#059669",
      authBg: "rgba(5, 150, 105, 0.1)",
      slack: "#7c3aed",
      slackBg: "rgba(124, 58, 237, 0.1)",
      loop: "#0891b2",
      loopBg: "rgba(8, 145, 178, 0.1)",
      wait: "#6b7280",
      waitBg: "rgba(107, 114, 128, 0.1)",
      document: "#ea580c",
      documentBg: "rgba(234, 88, 12, 0.1)",
      filter: "#7c3aed",
      filterBg: "rgba(124, 58, 237, 0.1)",
      approval: "#059669",
      approvalBg: "rgba(5, 150, 105, 0.1)",
      idempotency: "#0891b2",
      idempotencyBg: "rgba(8, 145, 178, 0.1)",
    },
    nodeBg: "#ffffff",
    nodeBorder: "rgba(180, 180, 180, 0.6)",
    nodeBorderSelected: "rgba(37, 99, 235, 0.9)",
    nodeText: "#1c1917",
    nodeSubtext: "#78716c",
    nodeConfigBg: "#fafaf9",
    nodeGlow: "rgba(37, 99, 235, 0.12)",
    sidebarBg: "#ffffff",
    sidebarBorder: "rgba(200, 200, 200, 0.7)",
    headerBg: "rgba(255, 255, 255, 0.98)",
    headerBorder: "rgba(200, 200, 200, 0.7)",
    accent: "#2563eb",
    accentHue: "37, 99, 235",
    accentLight: "rgba(37, 99, 235, 0.08)",
    minimapMask: "rgba(245, 245, 244, 0.85)",
    configPanelBg: "#ffffff",
    edgeColor: "rgba(120, 113, 108, 0.25)",
    edgeActive: "rgba(37, 99, 235, 0.6)",
    canvasNoise: 0,
  },
  {
    id: "ember",
    name: "Ember",
    icon: Flame,
    canvas: "#1a0c08",
    canvasPattern: "crosshatch",
    patternColor: "rgba(251, 146, 60, 0.12)",
    patternSize: 1,
    patternGap: 26,
    nodeColors: {
      ...triggerNodeColors,
      trigger: "#fb923c",
      triggerBg: "rgba(251, 146, 60, 0.12)",
      http: "#f97316",
      httpBg: "rgba(249, 115, 22, 0.12)",
      ai: "#fbbf24",
      aiBg: "rgba(251, 191, 36, 0.12)",
    },
    nodeBg: "rgba(30, 16, 8, 0.95)",
    nodeBorder: "rgba(120, 60, 30, 0.5)",
    nodeBorderSelected: "rgba(251, 146, 60, 0.8)",
    nodeText: "#fef3c7",
    nodeSubtext: "#a0845c",
    nodeConfigBg: "rgba(40, 22, 12, 0.8)",
    nodeGlow: "rgba(251, 146, 60, 0.15)",
    sidebarBg: "rgba(18, 10, 6, 0.98)",
    sidebarBorder: "rgba(120, 60, 30, 0.4)",
    headerBg: "rgba(18, 10, 6, 0.9)",
    headerBorder: "rgba(120, 60, 30, 0.4)",
    accent: "#fb923c",
    accentHue: "251, 146, 60",
    accentLight: "rgba(251, 146, 60, 0.12)",
    minimapMask: "rgba(26, 12, 8, 0.8)",
    configPanelBg: "rgba(18, 10, 6, 0.98)",
    edgeColor: "rgba(251, 146, 60, 0.2)",
    edgeActive: "rgba(251, 146, 60, 0.6)",
    canvasNoise: 0.03,
  },
  {
    id: "jade",
    name: "Jade",
    icon: Leaf,
    canvas: "#061210",
    canvasPattern: "dots",
    patternColor: "rgba(52, 211, 153, 0.14)",
    patternSize: 1,
    patternGap: 22,
    nodeColors: {
      ...triggerNodeColors,
      trigger: "#34d399",
      triggerBg: "rgba(52, 211, 153, 0.12)",
      http: "#2dd4bf",
      httpBg: "rgba(45, 212, 191, 0.12)",
      ai: "#6ee7b7",
      aiBg: "rgba(110, 231, 183, 0.12)",
    },
    nodeBg: "rgba(12, 24, 20, 0.95)",
    nodeBorder: "rgba(40, 80, 60, 0.5)",
    nodeBorderSelected: "rgba(52, 211, 153, 0.8)",
    nodeText: "#d1fae5",
    nodeSubtext: "#5e9e82",
    nodeConfigBg: "rgba(18, 36, 28, 0.8)",
    nodeGlow: "rgba(52, 211, 153, 0.12)",
    sidebarBg: "rgba(6, 14, 12, 0.98)",
    sidebarBorder: "rgba(40, 80, 60, 0.4)",
    headerBg: "rgba(6, 14, 12, 0.9)",
    headerBorder: "rgba(40, 80, 60, 0.4)",
    accent: "#34d399",
    accentHue: "52, 211, 153",
    accentLight: "rgba(52, 211, 153, 0.12)",
    minimapMask: "rgba(6, 18, 16, 0.8)",
    configPanelBg: "rgba(6, 14, 12, 0.98)",
    edgeColor: "rgba(52, 211, 153, 0.2)",
    edgeActive: "rgba(52, 211, 153, 0.6)",
    canvasNoise: 0.02,
  },
];

const WorkflowThemeContext = createContext<{
  theme: WorkflowTheme;
  setTheme: (id: string) => void;
}>({
  theme: themes[0],
  setTheme: () => {},
});

export function WorkflowThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("flux-workflow-theme") ?? "void";
    }
    return "void";
  });
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];

  const handleSetTheme = (id: string) => {
    setThemeId(id);
    localStorage.setItem("flux-workflow-theme", id);
  };

  return (
    <WorkflowThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
      {children}
    </WorkflowThemeContext.Provider>
  );
}

export function useWorkflowTheme() {
  return useContext(WorkflowThemeContext);
}
