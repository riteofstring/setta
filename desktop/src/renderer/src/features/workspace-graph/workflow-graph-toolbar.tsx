import type {
  WorkflowGraphProjection,
  WorkflowValidationDiagnostic,
  WorkflowValidationResult,
} from "@generated/backend";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  GitBranch,
  GitMerge,
  type LucideIcon,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Square,
  Workflow,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WorkflowDraftNodeType } from "./workflow-graph-draft";
import { shortIdentifier } from "./workflow-node-details-helpers";

const workflowOperationPendingDelayMs = 200;
const workflowOperationMinDwellMs = 500;

type WorkflowOperation = "run" | "validate";

interface WorkflowVisibleStatus {
  kind: "invalid" | "pending" | "stale" | "valid";
  label: string;
}

export interface WorkflowDraftNodePosition {
  worldX: number;
  worldY: number;
}

export const workflowNodeMenuItems = [
  { icon: Bot, label: "Agent Task", type: "agent_task" },
  { icon: GitBranch, label: "Route", type: "route" },
  { icon: GitMerge, label: "Merge", type: "merge" },
  { icon: Workflow, label: "Barrier Join", type: "barrier_join" },
  { icon: Circle, label: "Start", type: "start" },
  { icon: Square, label: "End", type: "end" },
] satisfies {
  icon: LucideIcon;
  label: string;
  type: WorkflowDraftNodeType;
}[];

function useWorkflowDisplayedOperation(busy: WorkflowOperation | null): WorkflowOperation | null {
  const [displayBusy, setDisplayBusy] = useState<WorkflowOperation | null>(null);
  const displayStartedAtRef = useRef(0);

  useEffect(() => {
    if (busy !== null) {
      if (displayBusy === busy) {
        return;
      }
      if (displayBusy !== null) {
        displayStartedAtRef.current = Date.now();
        setDisplayBusy(busy);
        return;
      }
      const timer = window.setTimeout(() => {
        displayStartedAtRef.current = Date.now();
        setDisplayBusy(busy);
      }, workflowOperationPendingDelayMs);
      return () => window.clearTimeout(timer);
    }

    if (displayBusy === null) {
      return;
    }

    const elapsedMs = Date.now() - displayStartedAtRef.current;
    const remainingMs = workflowOperationMinDwellMs - elapsedMs;
    if (remainingMs <= 0) {
      setDisplayBusy(null);
      return;
    }
    const timer = window.setTimeout(() => setDisplayBusy(null), remainingMs);
    return () => window.clearTimeout(timer);
  }, [busy, displayBusy]);

  return displayBusy;
}

export function WorkflowGraphToolbar({
  busy,
  onAddNode,
  onOpenDetails,
  onOpenSettings,
  onRun,
  onShowDraft,
  onValidate,
  projection,
  ready,
  selectedNodeLabel,
  validation,
  workspaceId,
}: {
  busy: "run" | "validate" | null;
  onAddNode: (nodeType: WorkflowDraftNodeType) => void;
  onOpenDetails: () => void;
  onOpenSettings: () => void;
  onRun: () => void;
  onShowDraft: () => void;
  onValidate: () => void;
  projection: WorkflowGraphProjection | null;
  ready: boolean;
  selectedNodeLabel: string;
  validation: WorkflowValidationResult | null;
  workspaceId: string;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const displayBusy = useWorkflowDisplayedOperation(busy);
  const model = workflowToolbarModel({
    busy,
    displayBusy,
    projection,
    ready,
    selectedNodeLabel,
    validation,
    workspaceId,
  });

  return (
    <div
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-md border border-zinc-700/80 bg-zinc-950/90 px-2 py-2 text-zinc-100 shadow-xl shadow-zinc-950/40 backdrop-blur"
      data-testid="workflow-graph-toolbar"
    >
      <span aria-live="polite" className="sr-only" role="status">
        {model.operationStatus}
      </span>
      <WorkflowToolbarTitle
        mismatchLabel={model.mismatchLabel}
        stateLabel={model.stateLabel}
        title={model.title}
        versionLabel={model.versionLabel}
      />
      <ToolbarButton
        disabled={model.settingsDisabled}
        icon={Settings}
        label="Settings"
        onClick={onOpenSettings}
        blocked={model.operationBlocked}
        testId="workflow-settings-button"
      />
      <WorkflowAddNodeMenu
        blocked={model.operationBlocked}
        disabled={model.hardDisabled || !model.editable}
        menuOpen={addMenuOpen}
        onAddNode={onAddNode}
        setMenuOpen={setAddMenuOpen}
      />
      <ToolbarButton
        accessibleLabel={model.validateAccessibleLabel}
        disabled={model.disabled || !model.editable}
        icon={model.validationIcon}
        label={model.validateLabel}
        onClick={onValidate}
        blocked={model.operationBlocked}
        spin={displayBusy === "validate"}
        testId="workflow-validate-button"
      />
      <ToolbarButton
        accessibleLabel={model.runAccessibleLabel}
        disabled={model.runDisabled}
        icon={model.runIcon}
        label={model.runLabel}
        onClick={onRun}
        blocked={model.operationBlocked}
        spin={displayBusy === "run"}
        testId="workflow-run-button"
      />
      <WorkflowOperationStatus status={model.visibleStatus} />
      <WorkflowDraftButton
        disabled={model.disabled}
        onShowDraft={onShowDraft}
        blocked={model.operationBlocked}
        viewingDraft={!model.showDraftButton}
      />
      <ToolbarButton
        disabled={model.detailsDisabled}
        icon={Eye}
        label={model.detailsLabel}
        onClick={onOpenDetails}
        blocked={model.operationBlocked}
        testId="workflow-node-details-button"
      />
    </div>
  );
}

export function WorkflowValidationPanel({ validation }: { validation: WorkflowValidationResult }) {
  const errors = validation.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = validation.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const visibleDiagnostics = validation.diagnostics.slice(0, 4);

  return (
    <div
      className="pointer-events-none max-w-md rounded-md border border-zinc-700/80 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 shadow-xl shadow-zinc-950/40 backdrop-blur"
      data-testid="workflow-validation-panel"
    >
      <WorkflowValidationSummary valid={validation.valid} />
      <WorkflowDiagnosticList diagnostics={visibleDiagnostics} />
      <WorkflowDiagnosticOverflow
        errors={errors.length}
        shown={visibleDiagnostics.length}
        total={validation.diagnostics.length}
        warnings={warnings.length}
      />
    </div>
  );
}

export function toolbarDraftNodePosition(
  projection: WorkflowGraphProjection | null,
): WorkflowDraftNodePosition {
  const nodeCount = projection?.nodes.length ?? 0;
  return {
    worldX: nodeCount === 0 ? 0 : 120 + nodeCount * 180,
    worldY: nodeCount === 0 ? 20 : 20 + (nodeCount % 3) * 120,
  };
}

function WorkflowToolbarTitle({
  mismatchLabel,
  stateLabel,
  title,
  versionLabel,
}: {
  mismatchLabel: string;
  stateLabel: string;
  title: string;
  versionLabel: string;
}) {
  return (
    <div className="min-w-0 px-1">
      <div
        className="max-w-56 truncate text-xs font-semibold text-zinc-100"
        data-testid="workflow-toolbar-title"
      >
        {title}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500" data-testid="workflow-toolbar-state">
        {stateLabel}
      </div>
      {versionLabel ? (
        <div
          className="mt-0.5 max-w-64 truncate font-mono text-[11px] text-zinc-500"
          data-testid="workflow-toolbar-version-state"
        >
          {versionLabel}
        </div>
      ) : null}
      {mismatchLabel ? (
        <div
          className="mt-0.5 max-w-64 truncate text-[11px] text-amber-300"
          data-testid="workflow-toolbar-version-mismatch"
        >
          {mismatchLabel}
        </div>
      ) : null}
    </div>
  );
}

function WorkflowAddNodeMenu({
  blocked,
  disabled,
  menuOpen,
  onAddNode,
  setMenuOpen,
}: {
  blocked: boolean;
  disabled: boolean;
  menuOpen: boolean;
  onAddNode: (nodeType: WorkflowDraftNodeType) => void;
  setMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void;
}) {
  useEffect(() => {
    if (blocked && menuOpen) {
      setMenuOpen(false);
    }
  }, [blocked, menuOpen, setMenuOpen]);

  return (
    <div className="relative">
      <button
        aria-disabled={disabled || blocked}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workflow-add-node-button"
        disabled={disabled}
        onClick={() => {
          if (blocked) {
            return;
          }
          setMenuOpen((open) => !open);
        }}
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {menuOpen ? (
        <WorkflowAddNodeMenuItems
          onAddNode={(nodeType) => {
            setMenuOpen(false);
            onAddNode(nodeType);
          }}
        />
      ) : null}
    </div>
  );
}

function WorkflowAddNodeMenuItems({
  onAddNode,
}: {
  onAddNode: (nodeType: WorkflowDraftNodeType) => void;
}) {
  return (
    <div
      className="absolute top-9 left-0 z-30 w-48 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl shadow-zinc-950/50"
      data-testid="workflow-toolbar-add-menu"
      role="menu"
    >
      {workflowNodeMenuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
            data-testid={`workflow-toolbar-add-${item.type}`}
            onClick={() => onAddNode(item.type)}
            role="menuitem"
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkflowDraftButton({
  blocked,
  disabled,
  onShowDraft,
  viewingDraft,
}: {
  blocked: boolean;
  disabled: boolean;
  onShowDraft: () => void;
  viewingDraft: boolean;
}) {
  if (viewingDraft) {
    return null;
  }
  return (
    <ToolbarButton
      blocked={blocked}
      disabled={disabled}
      icon={RefreshCcw}
      label="Draft"
      onClick={onShowDraft}
      testId="workflow-show-draft-button"
    />
  );
}

function WorkflowOperationStatus({ status }: { status: WorkflowVisibleStatus | null }) {
  return (
    <div className="flex h-8 w-24 shrink-0 items-center" data-testid="workflow-operation-status">
      {status ? (
        <span
          className={[
            "w-full truncate rounded-sm border px-2 py-1 text-center text-[11px] font-medium",
            workflowVisibleStatusClassName(status.kind),
          ].join(" ")}
        >
          {status.label}
        </span>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  accessibleLabel,
  blocked = false,
  disabled,
  icon: Icon,
  label,
  onClick,
  spin = false,
  testId,
}: {
  accessibleLabel?: string;
  blocked?: boolean;
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  spin?: boolean;
  testId: string;
}) {
  return (
    <button
      aria-disabled={disabled || blocked}
      aria-label={accessibleLabel ?? label}
      className="inline-flex h-8 max-w-36 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        if (blocked) {
          return;
        }
        onClick();
      }}
      title={accessibleLabel ?? label}
      type="button"
    >
      <Icon className={["h-3.5 w-3.5 shrink-0", spin ? "animate-spin" : ""].join(" ")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function WorkflowValidationSummary({ valid }: { valid: boolean }) {
  const Icon = valid ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-2 font-medium">
      <Icon className={valid ? "h-4 w-4 text-emerald-400" : "h-4 w-4 text-red-400"} />
      <span>{valid ? "Workflow draft is valid" : "Workflow draft has issues"}</span>
    </div>
  );
}

function WorkflowDiagnosticList({ diagnostics }: { diagnostics: WorkflowValidationDiagnostic[] }) {
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 space-y-1 text-zinc-300">
      {diagnostics.map((diagnostic) => (
        <WorkflowDiagnosticRow diagnostic={diagnostic} key={diagnosticKey(diagnostic)} />
      ))}
    </div>
  );
}

function WorkflowDiagnosticOverflow({
  errors,
  shown,
  total,
  warnings,
}: {
  errors: number;
  shown: number;
  total: number;
  warnings: number;
}) {
  if (total > shown) {
    return <div className="mt-2 text-zinc-500">{total - shown} more diagnostics</div>;
  }
  if (warnings > 0 && errors === 0) {
    return <div className="mt-2 text-zinc-500">{warnings} warning(s)</div>;
  }
  return null;
}

function WorkflowDiagnosticRow({ diagnostic }: { diagnostic: WorkflowValidationDiagnostic }) {
  const Icon = diagnostic.severity === "warning" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-2">
      <Icon
        className={
          diagnostic.severity === "warning"
            ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
            : "mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400"
        }
      />
      <div className="min-w-0">
        <div className="break-words">{diagnostic.message}</div>
        {diagnostic.nodeId || diagnostic.edgeId ? (
          <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {[diagnostic.nodeId, diagnostic.edgeId].filter(Boolean).join(" / ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function workflowToolbarModel({
  busy,
  displayBusy,
  projection,
  ready,
  selectedNodeLabel,
  validation,
  workspaceId,
}: {
  busy: "run" | "validate" | null;
  displayBusy: "run" | "validate" | null;
  projection: WorkflowGraphProjection | null;
  ready: boolean;
  selectedNodeLabel: string;
  validation: WorkflowValidationResult | null;
  workspaceId: string;
}) {
  const hardDisabled = workflowToolbarHardDisabled(ready, workspaceId);
  const operationBlocked = busy !== null;
  const editable = workflowProjectionIsEditableDraft(projection);
  return {
    detailsDisabled: workflowDetailsDisabled(hardDisabled, selectedNodeLabel),
    detailsLabel: workflowDetailsLabel(selectedNodeLabel),
    disabled: hardDisabled,
    editable,
    hardDisabled,
    mismatchLabel: workflowToolbarMismatchLabel(projection),
    operationBlocked,
    operationStatus: workflowOperationStatus(displayBusy, projection, validation),
    runAccessibleLabel: workflowRunAccessibleLabel(displayBusy),
    runDisabled: workflowRunDisabled(hardDisabled, editable, projection),
    runIcon: workflowRunIcon(displayBusy),
    runLabel: workflowRunLabel(),
    settingsDisabled: hardDisabled || projection === null,
    showDraftButton: workflowToolbarShowsDraftButton(projection),
    stateLabel: workflowToolbarStateLabel(projection, ready, workspaceId),
    title: workflowToolbarTitle(projection, workspaceId),
    validateAccessibleLabel: workflowValidateAccessibleLabel(displayBusy, projection, validation),
    validateLabel: workflowValidateLabel(),
    versionLabel: workflowToolbarVersionLabel(projection),
    validationIcon: workflowValidationIcon(projection, validation, displayBusy),
    visibleStatus: workflowVisibleStatus(displayBusy, projection, validation),
  };
}

function workflowToolbarHardDisabled(ready: boolean, workspaceId: string) {
  return !ready || workspaceId === "";
}

function workflowProjectionIsEditableDraft(projection: WorkflowGraphProjection | null) {
  return projection === null || (projection.viewMode === "draft" && projection.editable);
}

function workflowDetailsDisabled(disabled: boolean, selectedNodeLabel: string) {
  return disabled || selectedNodeLabel === "";
}

function workflowDetailsLabel(selectedNodeLabel: string) {
  return selectedNodeLabel === "" ? "Details" : selectedNodeLabel;
}

function workflowRunDisabled(
  disabled: boolean,
  editable: boolean,
  projection: WorkflowGraphProjection | null,
) {
  return disabled || !editable || projection === null;
}

function workflowRunIcon(busy: "run" | "validate" | null) {
  return busy === "run" ? RefreshCcw : Play;
}

function workflowRunLabel() {
  return "Run";
}

function workflowRunAccessibleLabel(busy: "run" | "validate" | null) {
  return busy === "run" ? "Starting workflow" : "Run";
}

function workflowValidateLabel() {
  return "Validate";
}

function workflowValidateAccessibleLabel(
  busy: "run" | "validate" | null,
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (busy === "validate") {
    return "Validating workflow";
  }
  if (projection?.validation.status === "stale") {
    return "Workflow changed since validation";
  }
  if (validation?.valid === true) {
    return "Workflow validated";
  }
  if (validation?.valid === false) {
    return "Workflow validation found issues";
  }
  return "Validate";
}

function workflowOperationStatus(
  busy: "run" | "validate" | null,
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
) {
  if (busy === "run") {
    return "Starting workflow";
  }
  if (busy === "validate") {
    return "Validating workflow";
  }
  if (projection?.validation.status === "stale") {
    return "Workflow changed since validation";
  }
  if (validation?.valid === true) {
    return "Workflow validated";
  }
  if (validation?.valid === false) {
    return "Workflow validation found issues";
  }
  return "";
}

function workflowVisibleStatus(
  busy: "run" | "validate" | null,
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
): WorkflowVisibleStatus | null {
  if (busy === "run") {
    return { kind: "pending", label: "Starting" };
  }
  if (busy === "validate") {
    return { kind: "pending", label: "Validating" };
  }
  if (projection?.validation.status === "stale") {
    return { kind: "stale", label: "Stale" };
  }
  if (validation?.valid === true) {
    return { kind: "valid", label: "Validated" };
  }
  if (validation?.valid === false) {
    return { kind: "invalid", label: "Issues found" };
  }
  return null;
}

function workflowVisibleStatusClassName(kind: WorkflowVisibleStatus["kind"]) {
  switch (kind) {
    case "invalid":
      return "border-red-500/50 bg-red-500/10 text-red-200";
    case "pending":
      return "border-zinc-600/70 bg-zinc-900 text-zinc-300";
    case "stale":
      return "border-amber-500/50 bg-amber-500/10 text-amber-200";
    case "valid":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function workflowToolbarTitle(projection: WorkflowGraphProjection | null, workspaceId: string) {
  if (projection !== null) {
    return projection.definitionName;
  }
  return workspaceId === "" ? "No workspace" : "Blank workflow draft";
}

function workflowValidationIcon(
  projection: WorkflowGraphProjection | null,
  validation: WorkflowValidationResult | null,
  busy: "run" | "validate" | null,
) {
  if (busy === "validate") {
    return Loader2;
  }
  if (projection?.validation.status === "stale") {
    return AlertTriangle;
  }
  if (validation === null) {
    return CheckCircle2;
  }
  return validation.valid ? CheckCircle2 : XCircle;
}

export function workflowToolbarStateLabel(
  projection: WorkflowGraphProjection | null,
  ready: boolean,
  workspaceId: string,
) {
  if (!ready) {
    return "Loading";
  }
  if (workspaceId === "") {
    return "No workspace";
  }
  if (projection === null) {
    return "Blank draft";
  }
  switch (projection.viewMode) {
    case "draft":
      return projection.editable ? "Draft editable" : "Draft read-only";
    case "run":
      return `Run ${projection.executionStatus ?? "running"} read-only`;
    case "version":
      return "Version snapshot read-only";
    default:
      return assertNever(projection.viewMode);
  }
}

export function workflowToolbarVersionLabel(projection: WorkflowGraphProjection | null) {
  if (projection === null || projection.viewMode === "draft") {
    return "";
  }
  const version = projection.definitionVersionNumber;
  const versionLabel = version > 0 ? `v${version}` : "version";
  const versionId = shortIdentifier(projection.definitionVersionId);
  if (projection.executionId !== "") {
    return `run ${shortIdentifier(projection.executionId)} / ${versionLabel} ${versionId}`;
  }
  return `${versionLabel} ${versionId}`;
}

export function workflowToolbarMismatchLabel(projection: WorkflowGraphProjection | null) {
  if (projection === null || !projection.versionMismatch) {
    return "";
  }
  return "Current draft differs from this version";
}

function workflowToolbarShowsDraftButton(projection: WorkflowGraphProjection | null) {
  return projection !== null && projection.viewMode !== "draft";
}

function diagnosticKey(diagnostic: WorkflowValidationDiagnostic) {
  return [
    diagnostic.severity,
    diagnostic.code,
    diagnostic.nodeId,
    diagnostic.edgeId,
    diagnostic.message,
  ].join(":");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow graph view mode: ${String(value)}`);
}
