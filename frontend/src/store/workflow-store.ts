import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import type { WorkflowEdge, WorkflowNode, WorkflowNodeType, WorkflowNodeData } from "@/components/workflow-types";
import { nodeCatalog } from "@/components/workflow-types";
import { defaultNodeConfig } from "@/lib/template-defaults";

type ToastMessage = {
  id: string;
  text: string;
  type: "success" | "error" | "info";
  /** Auto-dismiss delay in ms — errors linger longer so they can be read. */
  duration: number;
};

type WorkflowState = {
  workflowId: string | null;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  sidebarCollapsed: boolean;
  configPanelOpen: boolean;
  toasts: ToastMessage[];
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void;
  connect: (connection: Connection) => void;
  addNode: (type: WorkflowNodeType, position: { x: number; y: number }) => void;
  setWorkflowId: (id: string | null) => void;
  setWorkflowName: (name: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  toggleSidebar: () => void;
  toggleConfigPanel: () => void;
  loadWorkflow: (workflow: { id: string; name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => void;
  newWorkflow: () => void;
  showToast: (text: string, type?: ToastMessage["type"]) => void;
  dismissToast: (id: string) => void;
};

let toastCounter = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: null,
  workflowName: "Untitled workflow",
  nodes: [],
  edges: [],
  selectedNodeId: null,
  sidebarCollapsed: false,
  configPanelOpen: false,
  toasts: [],

  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));
    const selectChange = changes.find((c) => c.type === "select");
    if (selectChange && "selected" in selectChange && !selectChange.selected) {
      set({ selectedNodeId: null, configPanelOpen: false });
    }
  },
  onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  connect: (connection) => set((state) => {
    // Prevent self-connections
    if (connection.source === connection.target) return state;

    // Prevent duplicate edges (same source+target+sourceHandle)
    const isDuplicate = state.edges.some(
      (e) => e.source === connection.source
        && e.target === connection.target
        && e.sourceHandle === (connection.sourceHandle ?? "main")
    );
    if (isDuplicate) return state;

    // Prevent connecting to trigger nodes (they have no input)
    const targetNode = state.nodes.find((n) => n.id === connection.target);
    if (targetNode && (targetNode.data as WorkflowNodeData).type === "trigger") return state;

      return {
        edges: addEdge({
          ...connection,
          animated: true,
          type: "default",
          sourceHandle: connection.sourceHandle ?? "main",
          targetHandle: connection.targetHandle ?? "main",
        }, state.edges),
      };
  }),

  addNode: (type, position) => set((state) => {
    const node = nodeCatalog[type];
    // Seed from defaultNodeConfig first so canvas-dragged nodes execute out of
    // the box (matches template instantiation). Catalog defaultValues overlay on top.
    const config: Record<string, unknown> = { ...defaultNodeConfig(type) };
    for (const field of node.configFields) {
      if (field.defaultValue !== undefined) {
        config[field.key] = field.defaultValue;
      }
    }
    const newNode: WorkflowNode = {
      id: crypto.randomUUID(),
      type: "workflow",
      position,
      data: { label: node.label, type, config },
    };
    return { nodes: [...state.nodes, newNode] };
  }),

  setWorkflowId: (workflowId) => set({ workflowId }),
  setWorkflowName: (workflowName) => set({ workflowName }),

  setSelectedNodeId: (id) => set({ selectedNodeId: id, configPanelOpen: id !== null }),

  updateNodeConfig: (nodeId, key, value) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
        : n
    ),
  })),

  updateNodeLabel: (nodeId, label) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, label } }
        : n
    ),
  })),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleConfigPanel: () => set((state) => ({ configPanelOpen: !state.configPanelOpen })),

  loadWorkflow: (workflow) => set({
    workflowId: workflow.id,
    workflowName: workflow.name,
    nodes: workflow.nodes,
    edges: workflow.edges,
    selectedNodeId: null,
    configPanelOpen: false,
  }),

  newWorkflow: () => set({
    workflowId: null,
    workflowName: "Untitled workflow",
    nodes: [],
    edges: [],
    selectedNodeId: null,
    configPanelOpen: false,
  }),

  showToast: (text, type = "info") => {
    const id = `toast-${++toastCounter}`;
    const duration = type === "error" ? 6000 : 3500;
    set((state) => ({ toasts: [...state.toasts, { id, text, type, duration }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, duration);
  },

  dismissToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}));
