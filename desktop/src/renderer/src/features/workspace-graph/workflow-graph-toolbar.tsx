import type {
  WorkflowExecutionStatus,
  WorkflowExecutionSummary,
  WorkflowGraphProjection,
  WorkflowValidationDiagnostic,
  WorkflowValidationResult,
} from "@generated/backend";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Circle,
  CircleDot,
  Eye,
  GitBranch,
  GitMerge,
  History,
  type LucideIcon,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Square,
  Workflow,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import type { WorkflowDraftNodeType } from "./workflow-graph-draft";
import { shortIdentifier } from "./workflow-node-details-helpers";

export type WorkflowToolbarOperation = "run" | "validate" | "cancel";

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

export function WorkflowGraphToolbar({
  activeRun,
  busy,
  onAddNode,
  onOpenDetails,
  onOpenSettings,
  onSelectRun,
  onStop,
  onRun,
  onShowDraft,
  onViewActiveRun,
  onValidate,
  projection,
  ready,
  runSummaries,
  selectedNodeLabel,
  validation,
  workspaceId,
}: {
  busy: WorkflowToolbarOperation | null;
  activeRun: WorkflowExecutionSummary | null;
  onAddNode: (nodeType: WorkflowDraftNodeType) => void;
  onOpenDetails: () => void;
  onOpenSettings: () => void;
  onSelectRun: (summary: WorkflowExecutionSummary) => void;
  onStop: () => void;
  onRun: () => void;
  onShowDraft: () => void;
  onViewActiveRun: () => void;
  onValidate: () => void;
  projection: WorkflowGraphProjection | null;
  ready: boolean;
  runSummaries: WorkflowExecutionSummary[];
  selectedNodeLabel: string;
  validation: WorkflowValidationResult | null;
  workspaceId: string;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const model = workflowToolbarModel({
    activeRun,
    busy,
    projection,
    ready,
    runSummaries,
    selectedNodeLabel,
    validation,
    workspaceId,
  });

  return (
    <div
      className="absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-2"
      data-testid="workflow-graph-toolbar"
    >
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-md border border-zinc-700/80 bg-zinc-950/90 px-2 py-2 text-zinc-100 shadow-xl shadow-zinc-950/40 backdrop-blur">
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
          testId="workflow-settings-button"
        />
        <WorkflowAddNodeMenu
          disabled={model.disabled || !model.editable}
          menuOpen={addMenuOpen}
          onAddNode={onAddNode}
          setMenuOpen={setAddMenuOpen}
        />
        <ToolbarButton
          disabled={model.disabled || !model.editable}
          icon={model.validationIcon}
          label={model.validateLabel}
          onClick={onValidate}
          testId="workflow-validate-button"
        />
        {model.showRunButton ? (
          <ToolbarButton
            disabled={model.runDisabled}
            icon={model.runIcon}
            label={model.runLabel}
            onClick={onRun}
            spin={busy === "run"}
            testId="workflow-run-button"
          />
        ) : null}
        {model.showViewActiveRunButton ? (
          <ToolbarButton
            disabled={model.disabled}
            icon={CircleDot}
            label="View Active Run"
            onClick={onViewActiveRun}
            testId="workflow-view-active-run-button"
          />
        ) : null}
        {model.showStopButton ? (
          <ToolbarButton
            disabled={model.stopDisabled}
            icon={Square}
            label={model.stopLabel}
            onClick={onStop}
            spin={busy === "cancel"}
            testId="workflow-stop-button"
          />
        ) : null}
        <WorkflowRunSelector
          disabled={model.disabled || model.runSelectorItems.length === 0}
          menuOpen={runMenuOpen}
          onSelectRun={(summary) => {
            setRunMenuOpen(false);
            onSelectRun(summary);
          }}
          runSummaries={model.runSelectorItems}
          selectedRunId={model.selectedRunId}
          setMenuOpen={setRunMenuOpen}
        />
        <WorkflowDraftButton
          disabled={model.disabled}
          label={model.draftLabel}
          onShowDraft={onShowDraft}
          title={model.draftTitle}
          viewingDraft={!model.showDraftButton}
        />
        <ToolbarButton
          disabled={model.detailsDisabled}
          icon={Eye}
          label={model.detailsLabel}
          onClick={onOpenDetails}
          testId="workflow-node-details-button"
        />
      </div>
    </div>
  );
}

function WorkflowRunSelector({
  disabled,
  menuOpen,
  onSelectRun,
  runSummaries,
  selectedRunId,
  setMenuOpen,
}: {
  disabled: boolean;
  menuOpen: boolean;
  onSelectRun: (summary: WorkflowExecutionSummary) => void;
  runSummaries: WorkflowExecutionSummary[];
  selectedRunId: string;
  setMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void;
}) {
  if (runSummaries.length === 0) {
    return null;
  }
  const selected = runSummaries.find((summary) => summary.id === selectedRunId) ?? null;
  const label =
    selected === null
      ? `Runs ${runSummaries.length}`
      : `${workflowRunStatusLabel(selected.status)} ${shortIdentifier(selected.id)}`;
  return (
    <div className="relative">
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="inline-flex h-8 max-w-44 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workflow-run-selector-button"
        disabled={disabled}
        onClick={() => setMenuOpen((open) => !open)}
        title="Workflow runs"
        type="button"
      >
        <History className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {menuOpen ? (
        <div
          className="absolute top-9 left-0 z-30 w-72 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 shadow-2xl shadow-zinc-950/50"
          data-testid="workflow-run-selector-menu"
          role="menu"
        >
          {runSummaries.map((summary) => (
            <WorkflowRunSelectorRow
              key={summary.id}
              onSelectRun={onSelectRun}
              selected={summary.id === selectedRunId}
              summary={summary}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkflowRunSelectorRow({
  onSelectRun,
  selected,
  summary,
}: {
  onSelectRun: (summary: WorkflowExecutionSummary) => void;
  selected: boolean;
  summary: WorkflowExecutionSummary;
}) {
  const StatusIcon = summary.status === "running" ? CircleDot : Clock3;
  const version =
    summary.definitionVersionNumber > 0
      ? `v${summary.definitionVersionNumber}`
      : shortIdentifier(summary.definitionVersionId);
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={[
        "grid h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-left text-xs",
        selected ? "bg-cyan-950/70 text-cyan-100" : "text-zinc-200 hover:bg-zinc-800",
      ].join(" ")}
      data-testid={`workflow-run-selector-row-${summary.id}`}
      onClick={() => onSelectRun(summary)}
      role="menuitem"
      type="button"
    >
      <StatusIcon className={["h-3.5 w-3.5", workflowRunStatusColor(summary.status)].join(" ")} />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {workflowRunStatusLabel(summary.status)} · {shortIdentifier(summary.id)}
        </span>
        <span className="block truncate font-mono text-[11px] text-zinc-500">
          {version} · {workflowRunTimestamp(summary)}
        </span>
      </span>
      <span className="font-mono text-[11px] text-zinc-500">#{summary.lastEventOrdinal}</span>
    </button>
  );
}

export function WorkflowValidationPanel({ validation }: { validation: WorkflowValidationResult }) {
  const errors = validation.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = validation.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const visibleDiagnostics = validation.diagnostics.slice(0, 4);

  return (
    <div
      className="absolute top-16 left-3 z-10 max-w-md rounded-md border border-zinc-700/80 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 shadow-xl shadow-zinc-950/40 backdrop-blur"
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
  disabled,
  menuOpen,
  onAddNode,
  setMenuOpen,
}: {
  disabled: boolean;
  menuOpen: boolean;
  onAddNode: (nodeType: WorkflowDraftNodeType) => void;
  setMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void;
}) {
  return (
    <div className="relative">
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workflow-add-node-button"
        disabled={disabled}
        onClick={() => setMenuOpen((open) => !open)}
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
  disabled,
  label,
  onShowDraft,
  title,
  viewingDraft,
}: {
  disabled: boolean;
  label: string;
  onShowDraft: () => void;
  title: string;
  viewingDraft: boolean;
}) {
  if (viewingDraft) {
    return null;
  }
  return (
    <ToolbarButton
      disabled={disabled}
      icon={RefreshCcw}
      label={label}
      onClick={onShowDraft}
      testId="workflow-show-draft-button"
      title={title}
    />
  );
}

function ToolbarButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  spin = false,
  testId,
  title,
}: {
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  spin?: boolean;
  testId: string;
  title?: string;
}) {
  const accessibleLabel = title ?? label;
  return (
    <button
      aria-label={accessibleLabel}
      className="inline-flex h-8 max-w-36 items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={accessibleLabel}
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
  activeRun,
  busy,
  projection,
  ready,
  runSummaries,
  selectedNodeLabel,
  validation,
  workspaceId,
}: {
  activeRun: WorkflowExecutionSummary | null;
  busy: WorkflowToolbarOperation | null;
  projection: WorkflowGraphProjection | null;
  ready: boolean;
  runSummaries: WorkflowExecutionSummary[];
  selectedNodeLabel: string;
  validation: WorkflowValidationResult | null;
  workspaceId: string;
}) {
  const disabled = workflowToolbarDisabled(ready, workspaceId, busy);
  const editable = workflowProjectionIsEditableDraft(projection);
  const viewingDraft = projection === null || projection.viewMode === "draft";
  return {
    detailsDisabled: workflowDetailsDisabled(disabled, selectedNodeLabel),
    detailsLabel: workflowDetailsLabel(selectedNodeLabel),
    disabled,
    draftLabel: workflowDraftButtonLabel(projection),
    draftTitle: workflowDraftButtonTitle(projection),
    editable,
    mismatchLabel: workflowToolbarMismatchLabel(projection),
    runDisabled: workflowRunDisabled(disabled, editable, projection, activeRun),
    runIcon: workflowRunIcon(busy),
    runLabel: workflowRunLabel(busy),
    runSelectorItems: workflowRunSelectorItems(runSummaries),
    settingsDisabled: disabled || projection === null,
    selectedRunId: projection?.viewMode === "run" ? projection.executionId : "",
    showDraftButton: workflowToolbarShowsDraftButton(projection),
    showRunButton: workflowToolbarShowsRunButton(projection, activeRun),
    showStopButton: workflowToolbarShowsStopButton(projection),
    showViewActiveRunButton: viewingDraft && activeRun !== null,
    stateLabel: workflowToolbarStateLabel(projection, ready, workspaceId),
    stopDisabled: disabled || !workflowToolbarShowsStopButton(projection),
    stopLabel: workflowStopLabel(busy),
    title: workflowToolbarTitle(projection, workspaceId),
    validateLabel: workflowValidateLabel(busy),
    versionLabel: workflowToolbarVersionLabel(projection),
    validationIcon: workflowValidationIcon(validation),
  };
}

function workflowToolbarDisabled(
  ready: boolean,
  workspaceId: string,
  busy: WorkflowToolbarOperation | null,
) {
  return !ready || workspaceId === "" || busy !== null;
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
  activeRun: WorkflowExecutionSummary | null,
) {
  return disabled || !editable || projection === null || activeRun !== null;
}

function workflowRunIcon(busy: WorkflowToolbarOperation | null) {
  return busy === "run" ? RefreshCcw : Play;
}

function workflowRunLabel(busy: WorkflowToolbarOperation | null) {
  return busy === "run" ? "Starting" : "Run";
}

function workflowStopLabel(busy: WorkflowToolbarOperation | null) {
  return busy === "cancel" ? "Stopping" : "Stop";
}

function workflowValidateLabel(busy: WorkflowToolbarOperation | null) {
  return busy === "validate" ? "Validating" : "Validate";
}

export function workflowDraftButtonLabel(projection: WorkflowGraphProjection | null) {
  return projection !== null && projection.viewMode !== "draft" ? "Edit Draft" : "Draft";
}

export function workflowDraftButtonTitle(projection: WorkflowGraphProjection | null) {
  if (
    projection !== null &&
    projection.viewMode === "run" &&
    projection.executionStatus === "running"
  ) {
    return "Switch to the editable draft. This does not stop the running workflow.";
  }
  return "Switch to the editable draft.";
}

function workflowToolbarTitle(projection: WorkflowGraphProjection | null, workspaceId: string) {
  if (projection !== null) {
    return projection.definitionName;
  }
  return workspaceId === "" ? "No workspace" : "Blank workflow draft";
}

function workflowValidationIcon(validation: WorkflowValidationResult | null) {
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

export function workflowToolbarShowsRunButton(
  projection: WorkflowGraphProjection | null,
  activeRun: WorkflowExecutionSummary | null = null,
) {
  return activeRun === null && (projection === null || projection.viewMode === "draft");
}

export function workflowToolbarShowsStopButton(projection: WorkflowGraphProjection | null) {
  return (
    projection !== null &&
    projection.viewMode === "run" &&
    projection.executionId !== "" &&
    projection.executionStatus === "running"
  );
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

export function workflowActiveRunSummary(
  runSummaries: WorkflowExecutionSummary[],
): WorkflowExecutionSummary | null {
  return runSummaries.find((summary) => summary.status === "running") ?? null;
}

export function workflowRunSelectorItems(
  runSummaries: WorkflowExecutionSummary[],
): WorkflowExecutionSummary[] {
  const active = workflowActiveRunSummary(runSummaries);
  if (active === null) {
    return runSummaries;
  }
  return [active, ...runSummaries.filter((summary) => summary.id !== active.id)];
}

function workflowRunStatusLabel(status: WorkflowExecutionStatus) {
  return workflowRunStatusLabels[status];
}

function workflowRunStatusColor(status: WorkflowExecutionStatus) {
  return workflowRunStatusColors[status];
}

function workflowRunTimestamp(summary: WorkflowExecutionSummary) {
  const value = summary.completedAt || summary.updatedAt || summary.startedAt;
  if (value.length < 16) {
    return value;
  }
  return value.slice(0, 16).replace("T", " ");
}

const workflowRunStatusLabels = {
  cancelled: "Cancelled",
  completed: "Completed",
  failed: "Failed",
  idle: "Idle",
  running: "Running",
  stopped: "Stopped",
} satisfies Record<WorkflowExecutionStatus, string>;

const workflowRunStatusColors = {
  cancelled: "text-zinc-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  idle: "text-zinc-500",
  running: "text-cyan-400",
  stopped: "text-amber-400",
} satisfies Record<WorkflowExecutionStatus, string>;

function assertNever(value: never): never {
  throw new Error(`Unsupported workflow graph view mode: ${String(value)}`);
}
