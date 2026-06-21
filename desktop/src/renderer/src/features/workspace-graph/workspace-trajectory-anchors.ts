import type { WorkspaceTrajectorySprite, WorkspaceTrajectorySpriteKind } from "@generated/backend";

export interface WorkspaceTrajectoryWorkflowRunBinding {
  chatRunId: string;
  workflowExecutionId: string;
  workflowNodeExecutionId: string;
  workflowNodeId: string;
}

export interface WorkspaceTrajectoryAnchorState {
  activeWorkflowNodeIds?: string[];
  bindings?: WorkspaceTrajectoryWorkflowRunBinding[];
  workflowNodeIds: string[];
}

interface WorkspaceTrajectoryAnchorIndex {
  chatRunBindings: Map<string, WorkspaceTrajectoryWorkflowRunBinding>;
  nodeExecutionBindings: Map<string, WorkspaceTrajectoryWorkflowRunBinding>;
  singleActiveWorkflowNodeId: string;
  workflowNodeIds: Set<string>;
}

const activeNodeFallbackSpriteKinds = new Set<WorkspaceTrajectorySpriteKind>([
  "approval",
  "assistant_message",
  "command",
  "diff",
  "file_read",
  "file_write",
  "plan_update",
  "reasoning_summary",
  "test",
  "tool_call",
]);

export function emptyWorkspaceTrajectoryAnchorIndex(): WorkspaceTrajectoryAnchorIndex {
  return {
    chatRunBindings: new Map(),
    nodeExecutionBindings: new Map(),
    singleActiveWorkflowNodeId: "",
    workflowNodeIds: new Set(),
  };
}

export function updateWorkspaceTrajectoryAnchorIndex(
  current: WorkspaceTrajectoryAnchorIndex,
  anchors: WorkspaceTrajectoryAnchorState,
): WorkspaceTrajectoryAnchorIndex {
  const workflowNodeIds = new Set(anchors.workflowNodeIds.filter(Boolean));
  return {
    chatRunBindings:
      anchors.bindings === undefined
        ? current.chatRunBindings
        : bindingMap(anchors.bindings, (binding) => binding.chatRunId),
    nodeExecutionBindings:
      anchors.bindings === undefined
        ? current.nodeExecutionBindings
        : bindingMap(anchors.bindings, (binding) => binding.workflowNodeExecutionId),
    singleActiveWorkflowNodeId: singleActiveNodeId(
      anchors.activeWorkflowNodeIds ?? [],
      workflowNodeIds,
    ),
    workflowNodeIds,
  };
}

export function workspaceTrajectoryAnchorForSprite({
  anchorIndex,
  preservedAnchor,
  sprite,
  workflowExecutionId,
}: {
  anchorIndex: WorkspaceTrajectoryAnchorIndex;
  preservedAnchor: string;
  sprite: WorkspaceTrajectorySprite;
  workflowExecutionId: string;
}) {
  return (
    [
      explicitWorkflowNodeAnchor(sprite, anchorIndex.workflowNodeIds),
      workflowNodeExecutionAnchor(sprite, anchorIndex.nodeExecutionBindings),
      chatRunAnchor(sprite, anchorIndex.chatRunBindings),
      preservedAnchor,
      singleActiveNodeFallbackAnchorForSprite(
        sprite,
        anchorIndex.singleActiveWorkflowNodeId,
        workflowExecutionId,
      ),
    ].find((anchorNodeId) => anchorNodeId !== "") ?? ""
  );
}

function bindingMap(
  bindings: readonly WorkspaceTrajectoryWorkflowRunBinding[],
  keyForBinding: (binding: WorkspaceTrajectoryWorkflowRunBinding) => string,
) {
  return new Map(
    bindings
      .map((binding) => [keyForBinding(binding), binding] as const)
      .filter(([key]) => key !== ""),
  );
}

function explicitWorkflowNodeAnchor(
  sprite: WorkspaceTrajectorySprite,
  workflowNodeIds: ReadonlySet<string>,
) {
  return firstKnownWorkflowNodeId(
    [sprite.workflowNodeId, sourceRefId(sprite, "workflow_node")],
    workflowNodeIds,
  );
}

function workflowNodeExecutionAnchor(
  sprite: WorkspaceTrajectorySprite,
  nodeExecutionBindings: ReadonlyMap<string, WorkspaceTrajectoryWorkflowRunBinding>,
) {
  const executionId = firstNonEmpty(
    sprite.workflowNodeExecutionId,
    sourceRefId(sprite, "workflow_node_execution"),
  );
  return nodeExecutionBindings.get(executionId)?.workflowNodeId ?? "";
}

function chatRunAnchor(
  sprite: WorkspaceTrajectorySprite,
  chatRunBindings: ReadonlyMap<string, WorkspaceTrajectoryWorkflowRunBinding>,
) {
  const chatRunId = firstNonEmpty(sprite.chatRunId, sourceRefId(sprite, "chat_run"));
  return chatRunBindings.get(chatRunId)?.workflowNodeId ?? "";
}

function firstKnownWorkflowNodeId(
  candidates: readonly string[],
  workflowNodeIds: ReadonlySet<string>,
) {
  for (const candidate of candidates) {
    if (candidate !== "" && (workflowNodeIds.size === 0 || workflowNodeIds.has(candidate))) {
      return candidate;
    }
  }
  return "";
}

function singleActiveNodeId(candidates: readonly string[], workflowNodeIds: ReadonlySet<string>) {
  const knownActiveNodeIds = uniqueStrings(
    candidates.filter(
      (candidate) =>
        candidate !== "" && (workflowNodeIds.size === 0 || workflowNodeIds.has(candidate)),
    ),
  );
  return knownActiveNodeIds.length === 1 ? (knownActiveNodeIds[0] ?? "") : "";
}

function singleActiveNodeFallbackAnchorForSprite(
  sprite: WorkspaceTrajectorySprite,
  singleActiveWorkflowNodeId: string,
  workflowExecutionId: string,
) {
  if (singleActiveWorkflowNodeId === "") {
    return "";
  }
  if (!activeNodeFallbackSpriteKinds.has(sprite.kind)) {
    return "";
  }
  if (!spriteBelongsToWorkflowExecution(sprite, workflowExecutionId)) {
    return "";
  }
  if (!spriteHasRunOrChatSource(sprite)) {
    return "";
  }
  return singleActiveWorkflowNodeId;
}

function spriteBelongsToWorkflowExecution(
  sprite: WorkspaceTrajectorySprite,
  workflowExecutionId: string,
) {
  if (workflowExecutionId === "") {
    return false;
  }
  return [sprite.workflowExecutionId, sourceRefId(sprite, "workflow_execution")].includes(
    workflowExecutionId,
  );
}

function spriteHasRunOrChatSource(sprite: WorkspaceTrajectorySprite) {
  return (
    firstNonEmpty(
      sprite.runItemId,
      sprite.chatRunId,
      sourceRefId(sprite, "run_item"),
      sourceRefId(sprite, "chat_run"),
    ) !== ""
  );
}

function sourceRefId(sprite: WorkspaceTrajectorySprite, kind: string) {
  return sprite.sourceRefs.find((ref) => ref.kind === kind)?.id ?? "";
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value !== "") ?? "";
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}
