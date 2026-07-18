import type { SemanticNodeDetail } from "@generated/backend";
import {
  semanticEdgeKindValues,
  semanticNodeKindValues,
  semanticSteeringKindValues,
  semanticSteeringScopeValues,
} from "@generated/backend";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { WorkflowDetailsSection } from "./workflow-node-details-components";
import { shortIdentifier } from "./workflow-node-details-helpers";

type SemanticActor = { actorId: string; actorKind: "user" };
type MutationRunner = (name: string, action: () => Promise<unknown>) => Promise<void>;
type SemanticEdgeKindValue = (typeof semanticEdgeKindValues)[number];
type SemanticNodeKindValue = (typeof semanticNodeKindValues)[number];
type SemanticSteeringKindValue = (typeof semanticSteeringKindValues)[number];
type SemanticSteeringScopeValue = (typeof semanticSteeringScopeValues)[number];
type TerminalSteeringStatus = "completed" | "dismissed" | "superseded";

const semanticGraphUiActor: SemanticActor = {
  actorId: "semantic_graph_ui",
  actorKind: "user",
};

export function SemanticEditControls({
  detail,
  onMutation,
}: {
  detail: SemanticNodeDetail;
  onMutation?: () => void;
}) {
  const node = detail.node;
  const [label, setLabel] = useState(node.label);
  const [summary, setSummary] = useState(node.summary);
  const [nodeKind, setNodeKind] = useState<SemanticNodeKindValue>(node.kind);
  const [edgeTarget, setEdgeTarget] = useState("");
  const [edgeKind, setEdgeKind] = useState<SemanticEdgeKindValue>("related_to");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [constraintLabel, setConstraintLabel] = useState("");
  const [splitA, setSplitA] = useState("");
  const [splitB, setSplitB] = useState("");
  const [mergeSources, setMergeSources] = useState(node.id);
  const [mergeLabel, setMergeLabel] = useState("");
  const [directiveKind, setDirectiveKind] = useState<SemanticSteeringKindValue>("focus");
  const [directiveScope, setDirectiveScope] = useState<SemanticSteeringScopeValue>("session");
  const [directiveInstruction, setDirectiveInstruction] = useState("");
  const [directiveID, setDirectiveID] = useState(detail.steeringDirectives[0]?.id ?? "");
  const [directiveStatus, setDirectiveStatus] = useState<TerminalSteeringStatus>("completed");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState("");

  useEffect(() => {
    setLabel(node.label);
    setSummary(node.summary);
    setNodeKind(node.kind);
    setMergeSources(node.id);
    setDirectiveID(detail.steeringDirectives[0]?.id ?? "");
  }, [detail.steeringDirectives, node.id, node.kind, node.label, node.summary]);

  const runMutation = async (name: string, action: () => Promise<unknown>) => {
    setPendingAction(name);
    setActionError("");
    try {
      await action();
      onMutation?.();
    } catch (error) {
      setActionError(semanticMutationErrorMessage(error));
    } finally {
      setPendingAction("");
    }
  };

  const disabled = pendingAction !== "";
  return (
    <WorkflowDetailsSection title="Edit And Steering">
      <div className="space-y-3 text-xs" data-testid="semantic-edit-controls">
        <NodeEditFields
          disabled={disabled}
          label={label}
          nodeId={node.id}
          nodeKind={nodeKind}
          runMutation={runMutation}
          setLabel={setLabel}
          setNodeKind={setNodeKind}
          setSummary={setSummary}
          summary={summary}
          workspaceId={detail.workspaceId}
        />
        <EdgeCreationControls
          constraintLabel={constraintLabel}
          detail={detail}
          disabled={disabled}
          edgeKind={edgeKind}
          edgeLabel={edgeLabel}
          edgeTarget={edgeTarget}
          runMutation={runMutation}
          setConstraintLabel={setConstraintLabel}
          setEdgeKind={setEdgeKind}
          setEdgeLabel={setEdgeLabel}
          setEdgeTarget={setEdgeTarget}
        />
        <SplitMergeControls
          detail={detail}
          disabled={disabled}
          mergeLabel={mergeLabel}
          mergeSources={mergeSources}
          runMutation={runMutation}
          setMergeLabel={setMergeLabel}
          setMergeSources={setMergeSources}
          setSplitA={setSplitA}
          setSplitB={setSplitB}
          splitA={splitA}
          splitB={splitB}
        />
        <SteeringControls
          detail={detail}
          directiveID={directiveID}
          directiveInstruction={directiveInstruction}
          directiveKind={directiveKind}
          directiveScope={directiveScope}
          directiveStatus={directiveStatus}
          disabled={disabled}
          runMutation={runMutation}
          setDirectiveID={setDirectiveID}
          setDirectiveInstruction={setDirectiveInstruction}
          setDirectiveKind={setDirectiveKind}
          setDirectiveScope={setDirectiveScope}
          setDirectiveStatus={setDirectiveStatus}
        />
        {actionError !== "" ? <div className="text-rose-300">{actionError}</div> : null}
      </div>
    </WorkflowDetailsSection>
  );
}

function NodeEditFields({
  disabled,
  label,
  nodeId,
  nodeKind,
  runMutation,
  setLabel,
  setNodeKind,
  setSummary,
  summary,
  workspaceId,
}: {
  disabled: boolean;
  label: string;
  nodeId: string;
  nodeKind: SemanticNodeKindValue;
  runMutation: MutationRunner;
  setLabel: (value: string) => void;
  setNodeKind: (value: SemanticNodeKindValue) => void;
  setSummary: (value: string) => void;
  summary: string;
  workspaceId: string;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2">
        <label className="grid gap-1">
          <span className="font-medium text-zinc-400">Label</span>
          <input
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="font-medium text-zinc-400">Kind</span>
          <select
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={nodeKind}
            onChange={(event) => setNodeKind(event.currentTarget.value as SemanticNodeKindValue)}
          >
            {semanticNodeKindValues.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-medium text-zinc-400">Summary</span>
          <textarea
            className="min-h-16 rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={summary}
            onChange={(event) => setSummary(event.currentTarget.value)}
          />
        </label>
      </div>
      <SemanticButtonRow>
        <SemanticActionButton
          disabled={disabled}
          onClick={() =>
            void runMutation("rename", () =>
              window.setta.semanticGraph.renameNode({
                ...semanticGraphUiActor,
                label,
                nodeId,
                workspaceId,
              }),
            )
          }
        >
          Rename
        </SemanticActionButton>
        <SemanticActionButton
          disabled={disabled}
          onClick={() =>
            void runMutation("update", () =>
              window.setta.semanticGraph.updateNode({
                ...semanticGraphUiActor,
                kind: nodeKind,
                nodeId,
                summary,
                workspaceId,
              }),
            )
          }
        >
          Save Summary
        </SemanticActionButton>
        <SemanticActionButton
          disabled={disabled}
          onClick={() =>
            void runMutation("promote", () =>
              window.setta.semanticGraph.promoteNode({
                ...semanticGraphUiActor,
                nodeId,
                workspaceId,
              }),
            )
          }
        >
          Promote
        </SemanticActionButton>
        <SemanticActionButton
          disabled={disabled}
          onClick={() =>
            void runMutation("dismiss", () =>
              window.setta.semanticGraph.dismissNode({
                ...semanticGraphUiActor,
                nodeId,
                workspaceId,
              }),
            )
          }
        >
          Dismiss
        </SemanticActionButton>
      </SemanticButtonRow>
    </>
  );
}

function EdgeCreationControls({
  constraintLabel,
  detail,
  disabled,
  edgeKind,
  edgeLabel,
  edgeTarget,
  runMutation,
  setConstraintLabel,
  setEdgeKind,
  setEdgeLabel,
  setEdgeTarget,
}: {
  constraintLabel: string;
  detail: SemanticNodeDetail;
  disabled: boolean;
  edgeKind: SemanticEdgeKindValue;
  edgeLabel: string;
  edgeTarget: string;
  runMutation: MutationRunner;
  setConstraintLabel: (value: string) => void;
  setEdgeKind: (value: SemanticEdgeKindValue) => void;
  setEdgeLabel: (value: string) => void;
  setEdgeTarget: (value: string) => void;
}) {
  const addEdgeDisabled = disabled || edgeTarget.trim() === "";
  const addConstraintDisabled = disabled || constraintLabel.trim() === "";
  return (
    <>
      <div className="grid grid-cols-1 gap-2">
        <label className="grid gap-1">
          <span className="font-medium text-zinc-400">Add Edge Target</span>
          <input
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={edgeTarget}
            onChange={(event) => setEdgeTarget(event.currentTarget.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            value={edgeKind}
            onChange={(event) => setEdgeKind(event.currentTarget.value as SemanticEdgeKindValue)}
          >
            {semanticEdgeKindValues.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <input
            className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
            aria-label="Edge label"
            placeholder="Edge label"
            value={edgeLabel}
            onChange={(event) => setEdgeLabel(event.currentTarget.value)}
          />
        </div>
      </div>
      <SemanticButtonRow>
        <SemanticActionButton
          disabled={addEdgeDisabled}
          onClick={() =>
            void createEdge(detail, edgeTarget.trim(), edgeKind, edgeLabel, runMutation)
          }
        >
          Add Edge
        </SemanticActionButton>
        <SemanticActionButton
          disabled={addConstraintDisabled}
          onClick={() => void createConstraint(detail, constraintLabel.trim(), runMutation)}
        >
          Add Constraint
        </SemanticActionButton>
      </SemanticButtonRow>
      <input
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
        aria-label="Constraint label"
        placeholder="Constraint label"
        value={constraintLabel}
        onChange={(event) => setConstraintLabel(event.currentTarget.value)}
      />
    </>
  );
}

function SplitMergeControls({
  detail,
  disabled,
  mergeLabel,
  mergeSources,
  runMutation,
  setMergeLabel,
  setMergeSources,
  setSplitA,
  setSplitB,
  splitA,
  splitB,
}: {
  detail: SemanticNodeDetail;
  disabled: boolean;
  mergeLabel: string;
  mergeSources: string;
  runMutation: MutationRunner;
  setMergeLabel: (value: string) => void;
  setMergeSources: (value: string) => void;
  setSplitA: (value: string) => void;
  setSplitB: (value: string) => void;
  splitA: string;
  splitB: string;
}) {
  const splitDisabled = disabled || splitA.trim() === "" || splitB.trim() === "";
  const mergeDisabled = disabled || mergeSources.trim() === "" || mergeLabel.trim() === "";
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          aria-label="First split node label"
          placeholder="First split label"
          value={splitA}
          onChange={(event) => setSplitA(event.currentTarget.value)}
        />
        <input
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          aria-label="Second split node label"
          placeholder="Second split label"
          value={splitB}
          onChange={(event) => setSplitB(event.currentTarget.value)}
        />
      </div>
      <SemanticButtonRow>
        <SemanticActionButton
          disabled={splitDisabled}
          onClick={() => void splitNode(detail, splitA.trim(), splitB.trim(), runMutation)}
        >
          Split
        </SemanticActionButton>
        <SemanticActionButton
          disabled={mergeDisabled}
          onClick={() => void mergeNodes(detail, mergeSources, mergeLabel.trim(), runMutation)}
        >
          Merge
        </SemanticActionButton>
      </SemanticButtonRow>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          aria-label="Merge source node ids"
          placeholder="Merge source IDs"
          value={mergeSources}
          onChange={(event) => setMergeSources(event.currentTarget.value)}
        />
        <input
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          aria-label="Merged node label"
          placeholder="Merged label"
          value={mergeLabel}
          onChange={(event) => setMergeLabel(event.currentTarget.value)}
        />
      </div>
    </>
  );
}

function SteeringControls({
  detail,
  directiveID,
  directiveInstruction,
  directiveKind,
  directiveScope,
  directiveStatus,
  disabled,
  runMutation,
  setDirectiveID,
  setDirectiveInstruction,
  setDirectiveKind,
  setDirectiveScope,
  setDirectiveStatus,
}: {
  detail: SemanticNodeDetail;
  directiveID: string;
  directiveInstruction: string;
  directiveKind: SemanticSteeringKindValue;
  directiveScope: SemanticSteeringScopeValue;
  directiveStatus: TerminalSteeringStatus;
  disabled: boolean;
  runMutation: MutationRunner;
  setDirectiveID: (value: string) => void;
  setDirectiveInstruction: (value: string) => void;
  setDirectiveKind: (value: SemanticSteeringKindValue) => void;
  setDirectiveScope: (value: SemanticSteeringScopeValue) => void;
  setDirectiveStatus: (value: TerminalSteeringStatus) => void;
}) {
  const createDisabled = disabled || directiveInstruction.trim() === "";
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          value={directiveKind}
          onChange={(event) =>
            setDirectiveKind(event.currentTarget.value as SemanticSteeringKindValue)
          }
        >
          {semanticSteeringKindValues.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <select
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          value={directiveScope}
          onChange={(event) =>
            setDirectiveScope(event.currentTarget.value as SemanticSteeringScopeValue)
          }
        >
          {semanticSteeringScopeValues.map((scope) => (
            <option key={scope} value={scope}>
              {scope}
            </option>
          ))}
        </select>
      </div>
      <input
        className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
        aria-label="Steering instruction"
        placeholder="Steering instruction"
        value={directiveInstruction}
        onChange={(event) => setDirectiveInstruction(event.currentTarget.value)}
      />
      <SemanticButtonRow>
        <SemanticActionButton
          disabled={createDisabled}
          onClick={() =>
            void createDirective({
              detail,
              instruction: directiveInstruction.trim(),
              kind: directiveKind,
              runMutation,
              scope: directiveScope,
            })
          }
        >
          Add Steering
        </SemanticActionButton>
        <PresetDirectiveButtons detail={detail} disabled={disabled} runMutation={runMutation} />
      </SemanticButtonRow>
      <SteeringUpdateControls
        detail={detail}
        directiveID={directiveID}
        directiveStatus={directiveStatus}
        disabled={disabled}
        runMutation={runMutation}
        setDirectiveID={setDirectiveID}
        setDirectiveStatus={setDirectiveStatus}
      />
    </>
  );
}

function PresetDirectiveButtons({
  detail,
  disabled,
  runMutation,
}: {
  detail: SemanticNodeDetail;
  disabled: boolean;
  runMutation: MutationRunner;
}) {
  return (
    <>
      <PresetDirectiveButton
        detail={detail}
        disabled={disabled}
        instruction="Focus agent work here."
        kind="focus"
        runMutation={runMutation}
        scope="session"
      >
        Focus
      </PresetDirectiveButton>
      <PresetDirectiveButton
        detail={detail}
        disabled={disabled}
        instruction="Avoid this direction unless explicitly requested."
        kind="avoid"
        runMutation={runMutation}
        scope="workspace"
      >
        Avoid
      </PresetDirectiveButton>
      <PresetDirectiveButton
        detail={detail}
        disabled={disabled}
        instruction="Request validation before treating this as resolved."
        kind="validate"
        runMutation={runMutation}
        scope="workspace"
      >
        Validate
      </PresetDirectiveButton>
      <PresetDirectiveButton
        detail={detail}
        disabled={disabled}
        instruction="Pin this node for the current session context."
        kind="session_pin"
        runMutation={runMutation}
        scope="session"
      >
        Session Pin
      </PresetDirectiveButton>
      <PresetDirectiveButton
        detail={detail}
        disabled={disabled}
        instruction="Pin this node for workspace context."
        kind="workspace_pin"
        runMutation={runMutation}
        scope="workspace"
      >
        Workspace Pin
      </PresetDirectiveButton>
    </>
  );
}

function PresetDirectiveButton({
  children,
  detail,
  disabled,
  instruction,
  kind,
  runMutation,
  scope,
}: {
  children: ReactNode;
  detail: SemanticNodeDetail;
  disabled: boolean;
  instruction: string;
  kind: SemanticSteeringKindValue;
  runMutation: MutationRunner;
  scope: SemanticSteeringScopeValue;
}) {
  return (
    <SemanticActionButton
      disabled={disabled}
      onClick={() => void createDirective({ detail, instruction, kind, runMutation, scope })}
    >
      {children}
    </SemanticActionButton>
  );
}

function SteeringUpdateControls({
  detail,
  directiveID,
  directiveStatus,
  disabled,
  runMutation,
  setDirectiveID,
  setDirectiveStatus,
}: {
  detail: SemanticNodeDetail;
  directiveID: string;
  directiveStatus: TerminalSteeringStatus;
  disabled: boolean;
  runMutation: MutationRunner;
  setDirectiveID: (value: string) => void;
  setDirectiveStatus: (value: TerminalSteeringStatus) => void;
}) {
  if (detail.steeringDirectives.length === 0) {
    return null;
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          value={directiveID}
          onChange={(event) => setDirectiveID(event.currentTarget.value)}
        >
          {detail.steeringDirectives.map((directive) => (
            <option key={directive.id} value={directive.id}>
              {shortIdentifier(directive.id)}
            </option>
          ))}
        </select>
        <select
          className="rounded-sm border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-100"
          value={directiveStatus}
          onChange={(event) =>
            setDirectiveStatus(event.currentTarget.value as TerminalSteeringStatus)
          }
        >
          <option value="completed">completed</option>
          <option value="dismissed">dismissed</option>
          <option value="superseded">superseded</option>
        </select>
      </div>
      <SemanticButtonRow>
        <SemanticActionButton
          disabled={disabled || directiveID === ""}
          onClick={() =>
            void runMutation("update steering", () =>
              window.setta.semanticGraph.updateSteeringDirective({
                ...semanticGraphUiActor,
                directiveId: directiveID,
                instruction: null,
                status: directiveStatus,
                supersedesDirectiveId: "",
                workspaceId: detail.workspaceId,
              }),
            )
          }
        >
          Update Steering
        </SemanticActionButton>
      </SemanticButtonRow>
    </>
  );
}

function createEdge(
  detail: SemanticNodeDetail,
  edgeTarget: string,
  edgeKind: SemanticEdgeKindValue,
  edgeLabel: string,
  runMutation: MutationRunner,
) {
  return runMutation("add edge", () =>
    window.setta.semanticGraph.createEdge({
      ...semanticGraphUiActor,
      edgeId: "",
      fromNodeId: detail.node.id,
      kind: edgeKind,
      label: edgeLabel,
      summary: "",
      toNodeId: edgeTarget,
      workspaceId: detail.workspaceId,
    }),
  );
}

function createConstraint(
  detail: SemanticNodeDetail,
  constraintLabel: string,
  runMutation: MutationRunner,
) {
  return runMutation("add constraint", async () => {
    const created = await window.setta.semanticGraph.createNode({
      ...semanticGraphUiActor,
      kind: "constraint",
      label: constraintLabel,
      nodeId: "",
      summary: "",
      workspaceId: detail.workspaceId,
    });
    await window.setta.semanticGraph.createEdge({
      ...semanticGraphUiActor,
      edgeId: "",
      fromNodeId: requireCreatedNodeID(created.nodeDetail?.node.id),
      kind: "constrains",
      label: "constrains",
      summary: "",
      toNodeId: detail.node.id,
      workspaceId: detail.workspaceId,
    });
  });
}

function splitNode(
  detail: SemanticNodeDetail,
  splitA: string,
  splitB: string,
  runMutation: MutationRunner,
) {
  return runMutation("split", () =>
    window.setta.semanticGraph.splitNode({
      ...semanticGraphUiActor,
      nodes: [
        { kind: detail.node.kind, label: splitA, nodeId: "", summary: "" },
        { kind: detail.node.kind, label: splitB, nodeId: "", summary: "" },
      ],
      reassignments: emptyReassignments(),
      sourceNodeId: detail.node.id,
      workspaceId: detail.workspaceId,
    }),
  );
}

function mergeNodes(
  detail: SemanticNodeDetail,
  mergeSources: string,
  mergeLabel: string,
  runMutation: MutationRunner,
) {
  return runMutation("merge", () =>
    window.setta.semanticGraph.mergeNodes({
      ...semanticGraphUiActor,
      reassignments: emptyReassignments(),
      sourceNodeIds: mergeSources
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      targetNode: {
        kind: detail.node.kind,
        label: mergeLabel,
        nodeId: "",
        summary: "",
      },
      workspaceId: detail.workspaceId,
    }),
  );
}

function createDirective({
  detail,
  instruction,
  kind,
  runMutation,
  scope,
}: {
  detail: SemanticNodeDetail;
  instruction: string;
  kind: SemanticSteeringKindValue;
  runMutation: MutationRunner;
  scope: SemanticSteeringScopeValue;
}) {
  return runMutation("add steering", () =>
    window.setta.semanticGraph.createSteeringDirective({
      ...semanticGraphUiActor,
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      instruction,
      kind,
      runItemId: "",
      scope,
      targetEntityId: detail.node.id,
      workflowDefinitionId: "",
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: "",
      workspaceId: detail.workspaceId,
    }),
  );
}

function emptyReassignments() {
  return {
    activity: [],
    edges: [],
    evidence: [],
    layout: [],
    steering: [],
  };
}

function requireCreatedNodeID(nodeId: string | undefined) {
  if (!nodeId) {
    throw new Error("semantic node creation did not return a node id");
  }
  return nodeId;
}

function SemanticButtonRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function SemanticActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function semanticMutationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic graph mutation failed";
}
