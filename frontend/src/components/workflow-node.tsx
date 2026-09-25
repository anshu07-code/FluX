import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeCatalog, type WorkflowNodeData } from "./workflow-types";
import { useWorkflowStore } from "@/store/workflow-store";
import { useWorkflowTheme } from "@/lib/workflow-themes";
import { Check, AlertCircle } from "lucide-react";

function getNodeColor(theme: ReturnType<typeof useWorkflowTheme>["theme"], nodeType: string) {
  const nc = theme.nodeColors;
  const map: Record<string, { color: string; bg: string }> = {
    trigger: { color: nc.trigger, bg: nc.triggerBg },
    http: { color: nc.http, bg: nc.httpBg },
    ai: { color: nc.ai, bg: nc.aiBg },
    condition: { color: nc.condition, bg: nc.conditionBg },
    email: { color: nc.email, bg: nc.emailBg },
    database: { color: nc.database, bg: nc.databaseBg },
    code: { color: nc.code, bg: nc.codeBg },
    webhook: { color: nc.webhook, bg: nc.webhookBg },
    delay: { color: nc.delay, bg: nc.delayBg },
    set: { color: nc.set, bg: nc.setBg },
    switch: { color: nc.switch, bg: nc.switchBg },
    merge: { color: nc.merge, bg: nc.mergeBg },
    split: { color: nc.split, bg: nc.splitBg },
    error: { color: nc.error, bg: nc.errorBg },
    auth: { color: nc.auth, bg: nc.authBg },
    document: { color: nc.document, bg: nc.documentBg },
    filter: { color: nc.filter, bg: nc.filterBg },
    approval: { color: nc.approval, bg: nc.approvalBg },
    idempotency: { color: nc.idempotency, bg: nc.idempotencyBg },
  };
  return map[nodeType] ?? { color: theme.accent, bg: theme.accentLight };
}

type WorkflowNodeProps = NodeProps & {
  onAddStep?: (nodeId: string, handleId: string, position: { x: number; y: number }) => void;
};

export function WorkflowNode({ data, id }: WorkflowNodeProps) {
  const nodeData = data as WorkflowNodeData;
  const item = nodeCatalog[nodeData.type];
  const Icon = item.icon;
  const isTrigger = nodeData.type === "trigger";
  const { selectedNodeId } = useWorkflowStore();
  const { theme } = useWorkflowTheme();
  const isSelected = selectedNodeId === id;
  const nodeColor = getNodeColor(theme, nodeData.type);
  const outputs = item.outputs;

  const filledCount = (() => {
    const config = nodeData.config ?? {};
    return item.configFields.filter((f) => config[f.key] !== undefined && config[f.key] !== "").length;
  })();

  const handleAddStep = (e: React.MouseEvent, handleId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const onAddStep = (window as unknown as Record<string, unknown>).__fluxAddStep as
      | ((nodeId: string, handleId: string, pos: { x: number; y: number }) => void)
      | undefined;
    if (onAddStep) {
      onAddStep(id, handleId, { x: rect.right + 8, y: rect.top + rect.height / 2 });
    }
  };

  return (
    <div className="relative group">
      {/* INPUT — left side */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="main"
        />
      )}

      {/* Node pill card */}
      <div
        className="rounded-2xl transition-all duration-200 cursor-pointer"
        style={{
          background: isSelected
            ? "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(15, 23, 42, 0.95))"
            : "linear-gradient(135deg, rgba(20, 22, 32, 0.92), rgba(15, 23, 42, 0.9))",
          border: `1.5px solid ${isSelected ? nodeColor.color + "60" : "rgba(255,255,255,0.08)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: isSelected
            ? `0 0 24px ${nodeColor.color}20, 0 8px 32px rgba(0,0,0,0.4)`
            : "0 4px 24px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: `linear-gradient(135deg, ${nodeColor.color}18, ${nodeColor.color}08)`,
              border: `1px solid ${nodeColor.color}25`,
            }}
          >
            <span style={{ color: nodeColor.color }}>
              <Icon className="w-4 h-4" />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-semibold text-slate-100 leading-tight truncate">
                {nodeData.label}
              </p>
              {filledCount === 0 && item.configFields.length > 0 && (
                <AlertCircle className="w-3 h-3 shrink-0 text-amber-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
              {item.description}
            </p>
          </div>

          {filledCount > 0 && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium shrink-0"
              style={{ background: `${nodeColor.color}12`, color: nodeColor.color }}
            >
              {filledCount}/{item.configFields.length}
            </div>
          )}

          {isSelected && (
            <div
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center z-20"
              style={{ backgroundColor: nodeColor.color, boxShadow: `0 2px 8px ${nodeColor.color}40` }}
            >
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          )}
        </div>

        {item.configFields.length > 0 && (
          <div className="px-3.5 pb-2">
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((filledCount / item.configFields.length) * 100)}%`,
                  background: `linear-gradient(90deg, ${nodeColor.color}60, ${nodeColor.color})`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* OUTPUT(S) — right side with + button */}
      {outputs.length === 1 ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id={outputs[0].id}
          />
          <button
            className="absolute opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 flex items-center justify-center w-[18px] h-[18px] rounded-full"
            style={{
              right: -28,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(30, 27, 75, 0.95)",
              border: "1.5px solid rgba(129, 140, 248, 0.4)",
              boxShadow: "0 0 8px rgba(129, 140, 248, 0.2)",
            }}
            title="Add next step"
            onClick={(e) => handleAddStep(e, outputs[0].id)}
          >
            <span className="text-indigo-400 text-xs font-bold leading-none">+</span>
          </button>
        </>
      ) : (
        outputs.map((output, idx) => {
          const total = outputs.length;
          const topPercent = total === 1 ? 50 : (100 / (total + 1)) * (idx + 1);
          return (
            <div key={output.id}>
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                style={{ top: `${topPercent}%` }}
              />
              <button
                className="absolute opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 flex items-center justify-center w-[18px] h-[18px] rounded-full"
                style={{
                  right: -28,
                  top: `${topPercent}%`,
                  transform: "translateY(-50%)",
                  background: "rgba(30, 27, 75, 0.95)",
                  border: "1.5px solid rgba(129, 140, 248, 0.4)",
                  boxShadow: "0 0 8px rgba(129, 140, 248, 0.2)",
                }}
                title={`Add step from ${output.label}`}
                onClick={(e) => handleAddStep(e, output.id)}
              >
                <span className="text-indigo-400 text-xs font-bold leading-none">+</span>
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
