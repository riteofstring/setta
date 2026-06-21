import type { MutableRefObject } from "react";
import { createPortal } from "react-dom";

import type {
  WorkflowExecutionSummary,
  WorkflowGraphProjection,
  WorkflowValidationResult,
} from "@generated/backend";

import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  WorkflowGraphToolbar,
  WorkflowValidationPanel,
  type WorkflowToolbarOperation,
  workflowNodeMenuItems,
} from "./workflow-graph-toolbar";
import type { WorkflowDraftNodeType } from "./workflow-graph-draft";

export interface WorkflowContextMenuState {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

export function WorkflowGraphToolbarLayer({
  activeWorkflowRun,
  addWorkflowDraftNodeFromToolbar,
  cancelWorkflowRun,
  openWorkflowNodeDetails,
  openWorkflowSettings,
  runWorkflowDraft,
  runSummaries,
  selectWorkflowRun,
  selectedWorkflowNodeId,
  selectedWorkflowNodeLabel,
  showDraftWorkflow,
  syntheticGraph,
  validateWorkflowDraft,
  workflowOperation,
  workflowProjection,
  workflowProjectionLoading,
  workflowProjectionReady,
  workflowValidation,
  workflowWorkspaceId,
  viewActiveWorkflowRun,
}: {
  activeWorkflowRun: WorkflowExecutionSummary | null;
  addWorkflowDraftNodeFromToolbar: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  cancelWorkflowRun: () => Promise<void>;
  openWorkflowNodeDetails: (nodeId: string | null) => void;
  openWorkflowSettings: () => void;
  runWorkflowDraft: () => Promise<void>;
  runSummaries: WorkflowExecutionSummary[];
  selectWorkflowRun: (summary: WorkflowExecutionSummary) => Promise<void>;
  selectedWorkflowNodeId: string | null;
  selectedWorkflowNodeLabel: string;
  showDraftWorkflow: () => Promise<void>;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  validateWorkflowDraft: () => Promise<WorkflowValidationResult | null>;
  workflowOperation: WorkflowToolbarOperation | null;
  workflowProjection: WorkflowGraphProjection | null;
  workflowProjectionLoading: boolean;
  workflowProjectionReady: boolean;
  workflowValidation: WorkflowValidationResult | null;
  workflowWorkspaceId: string;
  viewActiveWorkflowRun: () => Promise<void>;
}) {
  if (syntheticGraph !== null) {
    return null;
  }
  return (
    <WorkflowGraphToolbar
      activeRun={activeWorkflowRun}
      busy={workflowOperation}
      loading={workflowProjectionLoading}
      onAddNode={(nodeType) => void addWorkflowDraftNodeFromToolbar(nodeType)}
      onOpenDetails={() => openWorkflowNodeDetails(selectedWorkflowNodeId)}
      onOpenSettings={() => openWorkflowSettings()}
      onRun={() => void runWorkflowDraft()}
      onSelectRun={(summary) => void selectWorkflowRun(summary)}
      onShowDraft={() => void showDraftWorkflow()}
      onStop={() => void cancelWorkflowRun()}
      onViewActiveRun={() => void viewActiveWorkflowRun()}
      onValidate={() => void validateWorkflowDraft()}
      projection={workflowProjection}
      ready={workflowProjectionReady}
      runSummaries={runSummaries}
      selectedNodeLabel={selectedWorkflowNodeLabel}
      validation={workflowValidation}
      workspaceId={workflowWorkspaceId}
    />
  );
}

export function WorkflowGraphStateLayers({
  loadingProjection,
  noWorkspace,
  semanticEmpty,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  semanticEmpty: boolean;
  workflowProjectionError: string;
}) {
  return workflowGraphStateLabels({
    loadingProjection,
    noWorkspace,
    semanticEmpty,
    workflowProjectionError,
  }).map((label) => <WorkflowGraphState key={label} label={label} />);
}

export function WorkflowValidationLayer({
  workflowValidation,
}: {
  workflowValidation: WorkflowValidationResult | null;
}) {
  if (!workflowValidation) {
    return null;
  }
  return <WorkflowValidationPanel validation={workflowValidation} />;
}

export function WorkflowContextMenuLayer({
  addWorkflowDraftNode,
  workflowContextMenu,
  workflowMenuRef,
}: {
  addWorkflowDraftNode: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  workflowContextMenu: WorkflowContextMenuState | null;
  workflowMenuRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (!workflowContextMenu) {
    return null;
  }
  return (
    <WorkflowCanvasContextMenu
      menu={workflowContextMenu}
      menuRef={workflowMenuRef}
      onSelectNodeType={(nodeType) => void addWorkflowDraftNode(nodeType)}
    />
  );
}

export function WorkflowGraphEditorErrorLayer({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <WorkflowGraphEditorError message={message} />;
}

function workflowGraphStateLabels({
  loadingProjection,
  noWorkspace,
  semanticEmpty,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  semanticEmpty: boolean;
  workflowProjectionError: string;
}) {
  const labels: string[] = [];
  if (loadingProjection) {
    labels.push("Loading workflow graph");
  }
  if (noWorkspace) {
    labels.push("Open a workspace to edit workflows");
  }
  if (semanticEmpty) {
    labels.push("Semantic graph empty");
  }
  if (workflowProjectionError) {
    labels.push(workflowProjectionError);
  }
  return labels;
}

function WorkflowGraphState({ label }: { label: string }) {
  return <div className="workspace-workflow-graph-state">{label}</div>;
}

function WorkflowGraphEditorError({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
      <div className="pointer-events-auto max-w-md rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-lg">
        {message}
      </div>
    </div>
  );
}

function WorkflowCanvasContextMenu({
  menu,
  menuRef,
  onSelectNodeType,
}: {
  menu: WorkflowContextMenuState;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  onSelectNodeType: (nodeType: WorkflowDraftNodeType) => void;
}) {
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 w-48 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 text-zinc-100 shadow-2xl shadow-zinc-950/50 backdrop-blur"
      data-testid="workflow-node-create-menu"
      role="menu"
      style={{ left: menu.clientX, top: menu.clientY }}
    >
      {workflowNodeMenuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
            data-testid={`workflow-node-create-${item.type}`}
            onClick={() => onSelectNodeType(item.type)}
            role="menuitem"
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
