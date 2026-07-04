import type {
  ActivityItemBlockProjection,
  RunActivityDetailsProjection,
  RunItemOutput,
  RunItemStatus,
  RunItemType,
  TranscriptBlock,
} from "@generated/backend";
import {
  AlertTriangle,
  Archive,
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Globe,
  ListChecks,
  Terminal,
  type LucideIcon,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { highlightCode } from "../lib/syntax-highlight";
import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import {
  currentPlanSurfaceActionForActivity,
  type CurrentPlanSurfaceAction,
} from "./chat-current-plan-surface-action";
import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";
import { BrailleSpinner } from "./ascii-spinner";
import {
  ActivityCommandExecutionDetails,
  ActivityCommandStartFailureDetails,
  ActivityDynamicToolDetails,
  ActivityExit,
  ActivityFileChangeDetails,
  ActivityJSONDetails,
  ActivityMCPDetails,
  ActivityApprovalDetails,
  ActivityPlanDetails,
  ActivityPreBlock,
  ActivityProviderStreamLifecycleDetails,
  ActivityTextBlock,
  activityPreBlockClassName,
} from "./chat-transcript-activity-details";
import { ActivityDiffDetails } from "./chat-transcript-diff-details";

export type LoadRunItemOutput = (
  runId: string,
  runItemId: string,
  afterOrdinal?: number,
  limit?: number,
) => Promise<void>;

const activityIconByType = {
  agent_message: Wrench,
  approval_review: AlertTriangle,
  collab_agent_tool_call: Wrench,
  command_execution: Terminal,
  command_start_failure: CircleAlert,
  context_compaction: Archive,
  diff: FileText,
  dynamic_tool_call: Wrench,
  file_change: FileText,
  hook: Wrench,
  image_generation: Wrench,
  image_view: Wrench,
  mcp_tool_call: Wrench,
  notice: AlertTriangle,
  approval_request: AlertTriangle,
  plan: ListChecks,
  reasoning: ListChecks,
  structured_input: ListChecks,
  terminal_interaction: Terminal,
  provider_stream_lifecycle: CircleAlert,
  web_search: Globe,
} satisfies Record<RunItemType, LucideIcon>;

const activityIconClassByType = {
  agent_message: "h-4 w-4 shrink-0 text-muted-foreground",
  approval_review: "h-4 w-4 shrink-0 text-status-alert",
  collab_agent_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  command_execution: "h-4 w-4 shrink-0 text-muted-foreground",
  command_start_failure: "h-4 w-4 shrink-0 text-status-critical-muted",
  context_compaction: "h-4 w-4 shrink-0 text-muted-foreground",
  diff: "h-4 w-4 shrink-0 text-muted-foreground",
  dynamic_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  file_change: "h-4 w-4 shrink-0 text-muted-foreground",
  hook: "h-4 w-4 shrink-0 text-muted-foreground",
  image_generation: "h-4 w-4 shrink-0 text-muted-foreground",
  image_view: "h-4 w-4 shrink-0 text-muted-foreground",
  mcp_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  notice: "h-4 w-4 shrink-0 text-status-warning",
  approval_request: "h-4 w-4 shrink-0 text-status-alert",
  plan: "h-4 w-4 shrink-0 text-muted-foreground",
  reasoning: "h-4 w-4 shrink-0 text-muted-foreground",
  structured_input: "h-4 w-4 shrink-0 text-muted-foreground",
  terminal_interaction: "h-4 w-4 shrink-0 text-muted-foreground",
  provider_stream_lifecycle: "h-4 w-4 shrink-0 text-status-warning",
  web_search: "h-4 w-4 shrink-0 text-muted-foreground",
} satisfies Record<RunItemType, string>;

interface ActivityRowOutputProps {
  outputPage: RunItemOutputPageState | undefined;
  outputs: RunItemOutput[];
  loadRunItemOutput: LoadRunItemOutput;
}

interface ActivityItemRowProps extends ActivityRowOutputProps {
  activeCurrentPlanTarget?: CurrentPlanSurfaceTarget | null;
  block: TranscriptBlock;
  expanded: boolean;
  focused?: boolean;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  onExpandedChange: (open: boolean) => void;
}

// ActivityItemRow renders one slim activity_item block. Expansion is controlled
// by the transcript so the derived group slot can bulk expand/collapse rows that
// virtualization has not mounted yet, and so a deep link can reveal one row.
export const ActivityItemRow = memo(function ActivityItemRow({
  activeCurrentPlanTarget = null,
  block,
  expanded,
  focused = false,
  loadRunItemOutput,
  onOpenCurrentPlanSurface,
  onExpandedChange,
  outputPage,
  outputs,
}: ActivityItemRowProps) {
  const activity = block.activity;
  if (!activity) {
    return null;
  }
  return (
    <ActivityRowView
      activity={activity}
      activeCurrentPlanTarget={activeCurrentPlanTarget}
      blockKind="activity_item"
      expanded={expanded}
      focused={focused}
      loadRunItemOutput={loadRunItemOutput}
      onOpenCurrentPlanSurface={onOpenCurrentPlanSurface}
      onExpandedChange={onExpandedChange}
      outputPage={outputPage}
      outputs={outputs}
      runId={block.runId}
    />
  );
}, activityItemRowPropsEqual);

function activityItemRowPropsEqual(previous: ActivityItemRowProps, next: ActivityItemRowProps) {
  return (
    previous.block === next.block &&
    previous.expanded === next.expanded &&
    previous.focused === next.focused &&
    previous.activeCurrentPlanTarget === next.activeCurrentPlanTarget &&
    previous.loadRunItemOutput === next.loadRunItemOutput &&
    previous.onOpenCurrentPlanSurface === next.onOpenCurrentPlanSurface &&
    previous.onExpandedChange === next.onExpandedChange &&
    previous.outputPage === next.outputPage &&
    sameOutputs(previous.outputs, next.outputs)
  );
}

function sameOutputs(previous: RunItemOutput[], next: RunItemOutput[]) {
  if (previous === next) {
    return true;
  }
  if (previous.length !== next.length) {
    return false;
  }
  return previous.every((output, index) => output === next[index]);
}

interface ActivityDisplayLabel {
  text: string;
  monospace: boolean;
}

function ActivityLabel({ className, label }: { className: string; label: ActivityDisplayLabel }) {
  return <span className={className}>{label.text}</span>;
}

function activityDisplayLabel(activity: ActivityItemBlockProjection): ActivityDisplayLabel {
  return (
    activityLabelResolvers[activity.type](activity) ?? {
      monospace: false,
      text: activity.title,
    }
  );
}

type ActivityLabelResolver = (activity: ActivityItemBlockProjection) => ActivityDisplayLabel | null;

const activityLabelResolvers = {
  agent_message: noActivityDisplayLabel,
  approval_review: noActivityDisplayLabel,
  collab_agent_tool_call: toolActivityDisplayLabel,
  command_execution: commandActivityDisplayLabel,
  command_start_failure: commandStartFailureActivityDisplayLabel,
  context_compaction: noActivityDisplayLabel,
  diff: diffActivityDisplayLabel,
  dynamic_tool_call: toolActivityDisplayLabel,
  file_change: fileActivityDisplayLabel,
  hook: noActivityDisplayLabel,
  image_generation: noActivityDisplayLabel,
  image_view: noActivityDisplayLabel,
  mcp_tool_call: toolActivityDisplayLabel,
  notice: noticeActivityDisplayLabel,
  approval_request: approvalActivityDisplayLabel,
  plan: noActivityDisplayLabel,
  reasoning: noActivityDisplayLabel,
  structured_input: noActivityDisplayLabel,
  terminal_interaction: commandActivityDisplayLabel,
  provider_stream_lifecycle: providerStreamLifecycleActivityDisplayLabel,
  web_search: webSearchActivityDisplayLabel,
} satisfies Record<RunItemType, ActivityLabelResolver>;

function noActivityDisplayLabel(): null {
  return null;
}

// The command activity title is the backend's friendly summary (Read/Searched/Ran),
// derived in the Go projection so the renderer never parses raw shell commands.
function commandActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  return { monospace: true, text: activity.title };
}

function commandStartFailureActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  return { monospace: false, text: activity.title };
}

function fileActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  if (activity.details.fileChange !== null) {
    return { monospace: false, text: activity.title };
  }
  if (activity.details.filePaths.length > 0) {
    return { monospace: true, text: filePathsDisplayLabel(activity.details.filePaths) };
  }
  return null;
}

function diffActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  if (activity.details.diff !== null) {
    return { monospace: false, text: activity.title };
  }
  return null;
}

function toolActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  if (activity.details.mcpToolCall !== null || activity.details.dynamicToolCall !== null) {
    return { monospace: false, text: activity.title };
  }
  const { serverName, toolName } = activity.details;
  if (toolName !== "" && serverName !== "") {
    return { monospace: true, text: `${serverName}.${toolName}` };
  }
  return toolName === "" ? null : { monospace: true, text: toolName };
}

function webSearchActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  const { progress, summary } = activity.details;
  if (summary !== "") {
    return { monospace: false, text: summary };
  }
  return progress === "" ? null : { monospace: false, text: progress };
}

function noticeActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  const { noticeKind, noticeMessage } = activity.details;
  if (noticeMessage !== "") {
    return { monospace: false, text: noticeMessage };
  }
  return noticeKind === "" ? null : { monospace: false, text: noticeKind };
}

function approvalActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  return activity.details.approval === null ? null : { monospace: false, text: activity.title };
}

function providerStreamLifecycleActivityDisplayLabel(activity: ActivityItemBlockProjection) {
  return activity.details.providerStreamLifecycle === null
    ? null
    : { monospace: false, text: activity.title };
}

function filePathsDisplayLabel(paths: string[]) {
  const [first, ...rest] = paths;
  if (!first) {
    return "";
  }
  if (rest.length === 0) {
    return first;
  }
  return `${first} + ${rest.length} more`;
}

function ActivityRowView({
  activity,
  activeCurrentPlanTarget,
  blockKind,
  expanded,
  focused,
  loadRunItemOutput,
  onOpenCurrentPlanSurface,
  onExpandedChange,
  outputPage,
  outputs,
  runId,
}: ActivityRowOutputProps & {
  activeCurrentPlanTarget?: CurrentPlanSurfaceTarget | null;
  activity: ActivityItemBlockProjection;
  blockKind: "activity_item" | undefined;
  expanded: boolean;
  focused: boolean;
  onExpandedChange: (open: boolean) => void;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  runId: string;
}) {
  const rowRef = useRef<HTMLDetailsElement>(null);
  useFocusedActivityRow(focused, rowRef, onExpandedChange);
  const focusAttributes = activityFocusAttributes(focused, activity.sourceRunItemId);
  const label = activityDisplayLabel(activity);
  if (!hasExpandableActivityRow(activity)) {
    return (
      <CompactActivityRow
        activity={activity}
        blockKind={blockKind}
        focusAttributes={focusAttributes}
        focused={focused}
        label={label}
        runId={runId}
      />
    );
  }
  const renderDetails = shouldRenderActivityDetails(expanded, focused);
  const outputText = renderDetails ? outputPreview(outputs) : "";
  const currentPlanSurfaceAction = currentPlanSurfaceActionForActivity({
    activeCurrentPlanTarget,
    activity,
    onOpenCurrentPlanSurface,
    runId,
  });
  return (
    <details
      className={cn(
        "group/item relative w-full max-w-full min-w-0 overflow-hidden rounded-sm text-xs text-foreground",
        focused && "ring-2 ring-accent-violet/70 ring-offset-1 ring-offset-background",
      )}
      data-block-kind={blockKind}
      data-run-id={runId}
      data-run-item-id={activity.sourceRunItemId}
      data-testid="run-activity-row"
      data-transcript-block={blockKind ? "true" : undefined}
      open={expanded}
      ref={rowRef}
      {...focusAttributes}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        if (nextOpen !== expanded) {
          onExpandedChange(nextOpen);
        }
        if (shouldLoadActivityOutput(nextOpen, activity, outputPage)) {
          void loadRunItemOutput(runId, activity.sourceRunItemId, 0);
        }
      }}
    >
      <summary className="flex h-6 min-w-0 cursor-pointer list-none items-center gap-1.5 text-left text-xs text-muted-foreground marker:hidden">
        <ActivityIcon type={activity.type} />
        <ActivityLabel
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-muted-foreground",
            label.monospace && "font-mono text-[12px] font-normal text-foreground",
          )}
          label={label}
        />
        <ActivityRowStatus status={activity.status} title={label.text} />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180" />
      </summary>
      {renderDetails ? (
        <ActivityDetails
          currentPlanSurfaceAction={currentPlanSurfaceAction}
          details={activity.details}
          loadMoreOutput={() =>
            void loadRunItemOutput(runId, activity.sourceRunItemId, outputPage?.nextOrdinal ?? 0)
          }
          outputPage={outputPage}
          outputText={outputText}
        />
      ) : null}
    </details>
  );
}

function CompactActivityRow({
  activity,
  blockKind,
  focusAttributes,
  focused,
  label,
  runId,
}: {
  activity: ActivityItemBlockProjection;
  blockKind: "activity_item" | undefined;
  focusAttributes: Record<string, string>;
  focused: boolean;
  label: ActivityDisplayLabel;
  runId: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-6 w-full max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-sm text-xs text-muted-foreground",
        focused && "ring-2 ring-accent-violet/70 ring-offset-1 ring-offset-background",
      )}
      data-block-kind={blockKind}
      data-run-id={runId}
      data-run-item-id={activity.sourceRunItemId}
      data-testid="run-activity-row"
      data-transcript-block={blockKind ? "true" : undefined}
      {...focusAttributes}
    >
      <ActivityIcon type={activity.type} />
      <ActivityLabel
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-muted-foreground",
          label.monospace && "font-mono text-[12px] font-normal text-foreground",
        )}
        label={label}
      />
      <ActivityRowStatus status={activity.status} title={label.text} />
    </div>
  );
}

function activityFocusAttributes(
  focused: boolean,
  sourceRunItemId: string,
): Record<string, string> {
  if (!focused) {
    return {};
  }
  return {
    "data-activity-focus-id": `run-item:${sourceRunItemId}`,
    "data-activity-focused": "true",
  };
}

function useFocusedActivityRow(
  focused: boolean,
  rowRef: RefObject<HTMLDetailsElement | null>,
  onExpandedChange: (open: boolean) => void,
) {
  // A deep-linked row expands and scrolls into view. Expansion is controlled, so
  // the open state is raised to the transcript rather than nudged on the element.
  useEffect(() => {
    if (!focused) {
      return;
    }
    onExpandedChange(true);
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focused, onExpandedChange, rowRef]);
}

// TranscriptActivityGroupHeader is the slim render-only row for a maximal run of
// adjacent activity blocks. It is never a persisted backend block; while
// collapsed, new member rows update this header instead of adding visible rows.
export function TranscriptActivityGroupHeader({
  expanded,
  members,
  onExpandedChange,
}: {
  expanded: boolean;
  members: TranscriptBlock[];
  onExpandedChange: (open: boolean) => void;
}) {
  const state = activityGroupHeaderState(members);
  if (!state) {
    return null;
  }
  const sourceRunItemIds = members
    .map((member) => member.activity?.sourceRunItemId ?? "")
    .filter((sourceRunItemId) => sourceRunItemId !== "")
    .join(" ");
  return (
    <button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} activity group`}
      className="flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm border border-border/70 bg-muted/55 px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      data-activity-group-expanded={expanded ? "true" : "false"}
      data-activity-group-source-run-item-ids={sourceRunItemIds}
      data-testid="activity-group-header"
      onClick={() => onExpandedChange(!expanded)}
      type="button"
    >
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-transform",
          expanded ? "rotate-180" : "-rotate-90",
        )}
      />
      <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-sm bg-muted px-1 font-mono text-[10px] leading-none text-muted-foreground">
        {members.length}
      </span>
      <ActivityRowStatus status={state.status} title={state.label.text} />
      <ActivityLabel
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-muted-foreground",
          state.label.monospace && "font-mono text-[12px] font-normal text-foreground",
        )}
        label={state.label}
      />
    </button>
  );
}

function activityGroupHeaderState(members: TranscriptBlock[]) {
  const activities = members
    .map((member) => member.activity)
    .filter((activity): activity is ActivityItemBlockProjection => activity !== null);
  const preview =
    activities.find((activity) => activity.status === "pending" || activity.status === "running") ??
    activities[0];
  if (!preview) {
    return null;
  }
  return {
    label: activityDisplayLabel(preview),
    status: aggregateActivityStatus(activities),
  };
}

function aggregateActivityStatus(activities: ActivityItemBlockProjection[]): RunItemStatus {
  if (activities.some((activity) => activity.status === "failed")) {
    return "failed";
  }
  if (activities.some((activity) => activity.status === "cancelled")) {
    return "cancelled";
  }
  if (
    activities.some((activity) => activity.status === "pending" || activity.status === "running")
  ) {
    return "running";
  }
  return "completed";
}

// RunItemActivityList renders projected activity rows for non-transcript surfaces
// (the workflow node-details feed). Those panes are not virtualized and preload
// output, so each row owns its expansion locally instead of lifting it.
export function RunItemActivityList({
  activity,
  highlightedRunItemId,
  loadRunItemOutput,
  outputIdsByRunItemId,
  outputPagesByRunItemId,
  outputsById,
  runId,
}: {
  activity: ActivityItemBlockProjection[];
  highlightedRunItemId?: string;
  loadRunItemOutput: LoadRunItemOutput;
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputsById: Record<string, RunItemOutput>;
  runId: string;
}) {
  if (activity.length === 0) {
    return null;
  }
  return (
    <div className="min-w-0 space-y-1.5 border-l border-border/70 pl-2">
      {activity.map((item) => (
        <LocalActivityRow
          activity={item}
          focused={
            highlightedRunItemId !== undefined && item.sourceRunItemId === highlightedRunItemId
          }
          key={item.sourceRunItemId}
          loadRunItemOutput={loadRunItemOutput}
          outputPage={outputPagesByRunItemId[item.sourceRunItemId]}
          outputs={activityRowOutputs(outputIdsByRunItemId, outputsById, item.sourceRunItemId)}
          runId={runId}
        />
      ))}
    </div>
  );
}

function LocalActivityRow({
  activity,
  focused,
  loadRunItemOutput,
  outputPage,
  outputs,
  runId,
}: ActivityRowOutputProps & {
  activity: ActivityItemBlockProjection;
  focused: boolean;
  runId: string;
}) {
  // The workflow surface is not virtualized; expansion lives on the row so the
  // shared controlled view keeps one code path. A focused (deep-linked) row is
  // opened by ActivityRowView's focus effect, which calls onExpandedChange.
  const [open, setOpen] = useState(false);
  return (
    <ActivityRowView
      activity={activity}
      blockKind={undefined}
      expanded={open}
      focused={focused}
      loadRunItemOutput={loadRunItemOutput}
      onExpandedChange={setOpen}
      outputPage={outputPage}
      outputs={outputs}
      runId={runId}
    />
  );
}

function ActivityDetails({
  currentPlanSurfaceAction,
  details,
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  currentPlanSurfaceAction: CurrentPlanSurfaceAction | null;
  details: RunActivityDetailsProjection;
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  const commandExecution = activityCommandExecutionDisplay(details);
  const genericResultDetails = hasGenericResultDetails(details);
  return (
    <div
      className="mt-1.5 w-full max-w-full min-w-0 overflow-hidden border-l border-border/70 pl-3"
      data-testid="run-activity-details"
    >
      <div className="w-full max-w-full min-w-0 space-y-1.5 overflow-hidden text-xs text-muted-foreground">
        <ActivityCwd cwd={commandExecution.cwd} />
        <ActivityCommand command={commandExecution.command} />
        <ActivityFiles paths={details.filePaths} />
        <ActivityMetadata details={details} />
        <ActivityTextBlock title="Summary" value={details.summary} />
        {genericResultDetails ? (
          <>
            <ActivityTextBlock title="Progress" value={details.progress} />
            <ActivityTextBlock title="Result" value={details.result} />
            <ActivityTextBlock title="Error" tone="error" value={details.error} />
          </>
        ) : null}
        <ActivityCommandExecutionDetails details={details} />
        <ActivityCommandStartFailureDetails details={details} />
        <ActivityFileChangeDetails details={details} />
        <ActivityDiffDetails details={details} />
        <ActivityPlanDetails
          currentPlanSurfaceAction={currentPlanSurfaceAction}
          details={details}
        />
        <ActivityApprovalDetails details={details} />
        <ActivityProviderStreamLifecycleDetails details={details} />
        <ActivityTextBlock title="Notice" value={details.noticeMessage} />
        <ActivityMCPDetails details={details} />
        <ActivityDynamicToolDetails details={details} />
        {genericResultDetails ? <ActivityJSONDetails details={details.details} /> : null}
        <ActivityExit
          durationMs={commandExecution.durationMs}
          exitCode={commandExecution.exitCode}
        />
        <ActivityOutput
          loadMoreOutput={loadMoreOutput}
          outputPage={outputPage}
          outputText={outputText}
        />
      </div>
    </div>
  );
}

function hasGenericResultDetails(details: RunActivityDetailsProjection) {
  return [
    details.mcpToolCall,
    details.dynamicToolCall,
    details.commandExecution,
    details.commandStartFailure,
    details.fileChange,
    details.diff,
    details.plan,
    details.approval,
    details.providerStreamLifecycle,
  ].every((value) => value === null);
}

function activityCommandExecutionDisplay(details: RunActivityDetailsProjection) {
  const commandExecution = details.commandExecution;
  if (commandExecution !== null) {
    return commandExecution;
  }
  const commandStartFailure = details.commandStartFailure;
  if (commandStartFailure === null) {
    return {
      command: details.command,
      cwd: details.cwd,
      durationMs: details.durationMs,
      exitCode: details.exitCode,
      processId: details.processId,
      result: details.result,
      error: details.error,
      source: null,
    };
  }
  return {
    command: commandStartFailure.command,
    cwd: commandStartFailure.cwd,
    durationMs: 0,
    exitCode: 0,
    processId: "",
    result: "",
    error: commandStartFailure.message,
    source: commandStartFailure.source,
  };
}

function hasExpandableActivityRow(activity: ActivityItemBlockProjection) {
  return activity.hasDetails || activity.hasOutput;
}

function shouldRenderActivityDetails(open: boolean, focused: boolean) {
  return open || focused;
}

function shouldLoadActivityOutput(
  open: boolean,
  activity: ActivityItemBlockProjection,
  outputPage: RunItemOutputPageState | undefined,
) {
  if (!open || !activity.hasOutput || outputPage?.loading) {
    return false;
  }
  return outputPage === undefined;
}

function ActivityCwd({ cwd }: { cwd: string }) {
  if (!cwd) {
    return null;
  }
  return <ActivityTextBlock monospace title="Cwd" value={cwd} />;
}

function ActivityCommand({ command }: { command: string }) {
  if (!command) {
    return null;
  }
  return <ActivityCommandBlock command={command} />;
}

// ActivityCommandBlock keeps command details in the same bounded block treatment
// as output and JSON fields. Highlighting is memoized per command.
function ActivityCommandBlock({ command }: { command: string }) {
  const highlighted = useMemo(() => highlightCode(command, "bash"), [command]);
  return (
    <section
      className="min-w-0"
      data-activity-detail-section="Command"
      data-activity-detail-kind="pre"
    >
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">Command</h4>
      <pre className={activityPreBlockClassName}>
        {highlighted === null ? (
          <code className="hljs whitespace-pre-wrap break-all">{command}</code>
        ) : (
          <code
            className="hljs whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
      </pre>
    </section>
  );
}

function ActivityFiles({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }
  return <ActivityPreBlock title="Files" value={paths.join("\n")} />;
}

function ActivityMetadata({ details }: { details: RunActivityDetailsProjection }) {
  const entries = activityMetadata(details);
  if (entries.length === 0) {
    return null;
  }
  return (
    <section
      className="min-w-0"
      data-activity-detail-section="Metadata"
      data-activity-detail-kind="chips"
    >
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">Metadata</h4>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {entries.map((entry, index) => (
          <span
            className="max-w-full min-w-0 truncate rounded-sm border border-border bg-popover px-2 py-0.5 font-mono text-muted-foreground"
            key={`${entry.label}:${entry.value}:${index}`}
          >
            {entry.label}: {entry.value}
          </span>
        ))}
      </div>
    </section>
  );
}

function activityMetadata(details: RunActivityDetailsProjection) {
  const commandExecution = activityCommandExecutionDisplay(details);
  const entries = [
    { label: "server", value: details.serverName },
    { label: "tool", value: details.toolName },
    { label: "namespace", value: details.namespace },
    { label: "process", value: commandExecution.processId },
    { label: "source", value: commandExecution.source ?? "" },
    { label: "request", value: details.requestId },
    { label: "review", value: details.reviewId },
    { label: "patch", value: details.patchStatus },
    { label: "notice", value: details.noticeKind },
    ...mcpToolCallMetadata(details),
    ...dynamicToolCallMetadata(details),
    ...commandStartFailureMetadata(details),
    ...approvalMetadata(details),
    ...providerStreamLifecycleMetadata(details),
  ];
  return entries.filter((entry) => entry.value !== "");
}

function mcpToolCallMetadata(details: RunActivityDetailsProjection) {
  if (details.mcpToolCall !== null) {
    return [
      { label: "server", value: details.mcpToolCall.serverName },
      { label: "tool", value: details.mcpToolCall.toolName },
      { label: "plugin", value: details.mcpToolCall.pluginId },
      { label: "resource", value: details.mcpToolCall.mcpAppResourceUri },
    ];
  }
  return [];
}

function dynamicToolCallMetadata(details: RunActivityDetailsProjection) {
  if (details.dynamicToolCall !== null) {
    return [
      { label: "namespace", value: details.dynamicToolCall.namespace },
      { label: "tool", value: details.dynamicToolCall.toolName },
      { label: "category", value: details.dynamicToolCall.category },
    ];
  }
  return [];
}

function commandStartFailureMetadata(details: RunActivityDetailsProjection) {
  if (details.commandStartFailure !== null) {
    return [
      { label: "source", value: details.commandStartFailure.source ?? "" },
      { label: "failure", value: details.commandStartFailure.failureClass },
      { label: "provider", value: details.commandStartFailure.providerErrorId },
      { label: "sandbox", value: details.commandStartFailure.sandbox },
      { label: "approval", value: details.commandStartFailure.approvalPolicy },
    ];
  }
  return [];
}

function approvalMetadata(details: RunActivityDetailsProjection) {
  if (details.approval !== null) {
    return [
      { label: "approval", value: details.approval.approvalId },
      { label: "kind", value: details.approval.approvalKind ?? "" },
      { label: "status", value: details.approval.approvalStatus ?? "" },
      { label: "request", value: details.approval.providerRequestId },
      { label: "review", value: details.approval.reviewId },
      { label: "action", value: details.approval.actionType },
    ];
  }
  return [];
}

function providerStreamLifecycleMetadata(details: RunActivityDetailsProjection) {
  if (details.providerStreamLifecycle !== null) {
    return [
      { label: "thread", value: details.providerStreamLifecycle.providerThreadId },
      { label: "turn", value: details.providerStreamLifecycle.providerTurnId },
      { label: "liveness", value: details.providerStreamLifecycle.livenessStatus },
      { label: "reason", value: details.providerStreamLifecycle.livenessReason },
    ];
  }
  return [];
}

function ActivityOutput({
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  if (!hasActivityOutput(outputText, outputPage)) {
    return null;
  }
  return (
    <div className="w-full max-w-full min-w-0 space-y-2 overflow-hidden">
      {outputText ? <ActivityPreBlock title="Output" value={outputText} /> : null}
      {outputPage?.error ? (
        <div className="font-medium text-status-critical">{outputPage.error}</div>
      ) : null}
      {outputPage?.hasMore ? (
        <button
          className="self-start rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          disabled={outputPage.loading}
          onClick={loadMoreOutput}
          type="button"
        >
          Load more
        </button>
      ) : null}
      {outputPage?.loading ? (
        <BrailleSpinner className="text-muted-foreground" label="Loading tool output" />
      ) : null}
    </div>
  );
}

function hasActivityOutput(outputText: string, outputPage: RunItemOutputPageState | undefined) {
  return Boolean(outputText || outputPage?.hasMore || outputPage?.loading || outputPage?.error);
}

function ActivityIcon({ type }: { type: RunItemType }) {
  const Icon = activityIconByType[type];
  return <Icon className={activityIconClassByType[type]} />;
}

// ActivityRowStatus shows the run status as an icon: a spinner while active, a
// green check on success, a red cross on failure, a slash on cancellation.
function ActivityRowStatus({ status, title }: { status: RunItemStatus; title: string }) {
  if (status === "running" || status === "pending") {
    return <BrailleSpinner className="text-accent-violet" label={`${title} running`} />;
  }
  if (status === "completed") {
    return <Check aria-label="completed" className="h-4 w-4 shrink-0 text-status-success-muted" />;
  }
  if (status === "failed") {
    return (
      <CircleAlert aria-label="failed" className="h-4 w-4 shrink-0 text-status-critical-muted" />
    );
  }
  if (status === "cancelled") {
    return <Ban aria-label="cancelled" className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return null;
}

export function activityRowOutputs(
  outputIdsByRunItemId: Record<string, string[]>,
  outputsById: Record<string, RunItemOutput>,
  runItemId: string,
) {
  return (outputIdsByRunItemId[runItemId] ?? [])
    .map((outputId) => outputsById[outputId])
    .filter((output): output is RunItemOutput => output !== undefined);
}

function outputPreview(outputs: RunItemOutput[]) {
  const text = outputs.map((output) => output.text).join("");
  if (text.length <= 2000) {
    return text;
  }
  return `${text.slice(0, 2000)}\n...`;
}
