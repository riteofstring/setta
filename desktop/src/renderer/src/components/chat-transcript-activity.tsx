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
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Globe,
  ListChecks,
  Terminal,
  type LucideIcon,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import { BrailleSpinner } from "./ascii-spinner";

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
  context_compaction: Archive,
  diff: FileText,
  dynamic_tool_call: Wrench,
  file_change: FileText,
  hook: Wrench,
  image_generation: Wrench,
  image_view: Wrench,
  mcp_tool_call: Wrench,
  notice: AlertTriangle,
  plan: ListChecks,
  reasoning: ListChecks,
  structured_input: ListChecks,
  terminal_interaction: Terminal,
  web_search: Globe,
} satisfies Record<RunItemType, LucideIcon>;

const activityIconClassByType = {
  agent_message: "h-4 w-4 shrink-0 text-muted-foreground",
  approval_review: "h-4 w-4 shrink-0 text-status-alert",
  collab_agent_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  command_execution: "h-4 w-4 shrink-0 text-muted-foreground",
  context_compaction: "h-4 w-4 shrink-0 text-muted-foreground",
  diff: "h-4 w-4 shrink-0 text-muted-foreground",
  dynamic_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  file_change: "h-4 w-4 shrink-0 text-muted-foreground",
  hook: "h-4 w-4 shrink-0 text-muted-foreground",
  image_generation: "h-4 w-4 shrink-0 text-muted-foreground",
  image_view: "h-4 w-4 shrink-0 text-muted-foreground",
  mcp_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  notice: "h-4 w-4 shrink-0 text-status-warning",
  plan: "h-4 w-4 shrink-0 text-muted-foreground",
  reasoning: "h-4 w-4 shrink-0 text-muted-foreground",
  structured_input: "h-4 w-4 shrink-0 text-muted-foreground",
  terminal_interaction: "h-4 w-4 shrink-0 text-muted-foreground",
  web_search: "h-4 w-4 shrink-0 text-muted-foreground",
} satisfies Record<RunItemType, string>;

interface ActivityRowOutputProps {
  outputPage: RunItemOutputPageState | undefined;
  outputs: RunItemOutput[];
  loadRunItemOutput: LoadRunItemOutput;
}

interface ActivityItemRowProps extends ActivityRowOutputProps {
  block: TranscriptBlock;
  expanded: boolean;
  focused?: boolean;
  onExpandedChange: (open: boolean) => void;
}

// ActivityItemRow renders one slim activity_item block. Expansion is controlled
// by the transcript so the derived group slot can bulk expand/collapse rows that
// virtualization has not mounted yet, and so a deep link can reveal one row.
export const ActivityItemRow = memo(function ActivityItemRow({
  block,
  expanded,
  focused = false,
  loadRunItemOutput,
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
      blockKind="activity_item"
      expanded={expanded}
      focused={focused}
      loadRunItemOutput={loadRunItemOutput}
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
    previous.loadRunItemOutput === next.loadRunItemOutput &&
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

function ActivityRowView({
  activity,
  blockKind,
  expanded,
  focused,
  loadRunItemOutput,
  onExpandedChange,
  outputPage,
  outputs,
  runId,
}: ActivityRowOutputProps & {
  activity: ActivityItemBlockProjection;
  blockKind: "activity_item" | undefined;
  expanded: boolean;
  focused: boolean;
  onExpandedChange: (open: boolean) => void;
  runId: string;
}) {
  const rowRef = useRef<HTMLDetailsElement>(null);
  useFocusedActivityRow(focused, rowRef, onExpandedChange);
  const focusAttributes = activityFocusAttributes(focused, activity.sourceRunItemId);
  if (!hasExpandableActivityRow(activity)) {
    return (
      <CompactActivityRow
        activity={activity}
        blockKind={blockKind}
        focusAttributes={focusAttributes}
        focused={focused}
        runId={runId}
      />
    );
  }
  const renderDetails = shouldRenderActivityDetails(expanded, focused, activity, outputs);
  const outputText = renderDetails ? outputPreview(outputs) : "";
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
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
          {activity.title}
        </span>
        <ActivityRowStatus status={activity.status} title={activity.title} />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/item:rotate-180" />
      </summary>
      {renderDetails ? (
        <ActivityDetails
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
  runId,
}: {
  activity: ActivityItemBlockProjection;
  blockKind: "activity_item" | undefined;
  focusAttributes: Record<string, string>;
  focused: boolean;
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
      <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
        {activity.title}
      </span>
      <ActivityRowStatus status={activity.status} title={activity.title} />
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

// TranscriptActivityGroupSlot is the slim render-only label above a maximal run
// of adjacent activity rows. It carries the type/count label and the hover/focus
// bulk expand/collapse control. It is never a persisted backend block; the slot
// is reserved before the first row so a later adjacent row only mutates it.
export function TranscriptActivityGroupSlot({
  count,
  category,
  controlsVisible = false,
  expandableBlockIds,
  expandedBlockIds,
  onBulkToggle,
  status,
}: {
  count: number;
  category: "commands" | "tools" | "actions";
  controlsVisible?: boolean;
  expandableBlockIds: string[];
  expandedBlockIds: Set<string>;
  onBulkToggle: (blockIds: string[], open: boolean) => void;
  status: RunItemStatus;
}) {
  const anyCollapsed = expandableBlockIds.some((blockId) => !expandedBlockIds.has(blockId));
  const hasExpandable = expandableBlockIds.length > 0;
  return (
    <div className="group/activity-slot flex h-[22px] min-w-0 items-center gap-2 pl-0.5 text-[11px] font-semibold tracking-[0.02em] text-muted-foreground/80">
      <span className="min-w-0 truncate" data-testid="activity-group-label">
        {activityGroupLabel(count, category)}
      </span>
      <ActivityGroupStatus status={status} />
      {hasExpandable ? (
        <button
          aria-label={anyCollapsed ? "Expand all activity rows" : "Collapse all activity rows"}
          className={cn(
            "ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/activity-slot:opacity-100 group-focus-within/activity-slot:opacity-100",
            controlsVisible && "opacity-100",
          )}
          data-testid="activity-group-bulk-toggle"
          onClick={() => onBulkToggle(expandableBlockIds, anyCollapsed)}
          title={anyCollapsed ? "Expand all" : "Collapse all"}
          type="button"
        >
          {anyCollapsed ? (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronsDownUp className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function activityGroupLabel(count: number, category: "commands" | "tools" | "actions") {
  if (count === 1) {
    return singularActivityCategory[category];
  }
  return `${count} ${category}`;
}

const singularActivityCategory = {
  commands: "command",
  tools: "tool",
  actions: "action",
} satisfies Record<"commands" | "tools" | "actions", string>;

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
  details,
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  details: RunActivityDetailsProjection;
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  return (
    <div className="mt-1.5 w-full max-w-full min-w-0 overflow-hidden border-l border-border/70 pl-2">
      <div className="w-full max-w-full min-w-0 space-y-1.5 overflow-hidden text-xs text-muted-foreground">
        <ActivityCwd cwd={details.cwd} />
        <ActivityCommand command={details.command} />
        <ActivityFiles paths={details.filePaths} />
        <ActivityMetadata details={details} />
        <ActivityTextBlock title="Summary" value={details.summary} />
        <ActivityTextBlock title="Progress" value={details.progress} />
        <ActivityTextBlock title="Result" value={details.result} />
        <ActivityTextBlock title="Error" tone="error" value={details.error} />
        <ActivityTextBlock title="Notice" value={details.noticeMessage} />
        <ActivityTextBlock title="Diff" value={details.diffSummary} />
        <ActivityJSONDetails details={details.details} />
        <ActivityExit durationMs={details.durationMs} exitCode={details.exitCode} />
        <ActivityOutput
          loadMoreOutput={loadMoreOutput}
          outputPage={outputPage}
          outputText={outputText}
        />
      </div>
    </div>
  );
}

function hasExpandableActivityRow(activity: ActivityItemBlockProjection) {
  return activity.hasDetails || activity.hasOutput;
}

function shouldRenderActivityDetails(
  open: boolean,
  focused: boolean,
  activity: ActivityItemBlockProjection,
  outputs: RunItemOutput[],
) {
  if (open || focused) {
    return true;
  }
  if (activity.status !== "pending" && activity.status !== "running") {
    return true;
  }
  return outputs.length === 0;
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
  return <ActivityPreBlock title="Command" value={command} />;
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
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span
          className="max-w-full min-w-0 truncate rounded-sm border border-border bg-popover px-2 py-0.5 font-mono text-muted-foreground"
          key={entry.label}
        >
          {entry.label}: {entry.value}
        </span>
      ))}
    </div>
  );
}

function activityMetadata(details: RunActivityDetailsProjection) {
  return [
    { label: "server", value: details.serverName },
    { label: "tool", value: details.toolName },
    { label: "namespace", value: details.namespace },
    { label: "process", value: details.processId },
    { label: "request", value: details.requestId },
    { label: "review", value: details.reviewId },
    { label: "patch", value: details.patchStatus },
    { label: "notice", value: details.noticeKind },
  ].filter((entry) => entry.value !== "");
}

function ActivityTextBlock({
  monospace = false,
  title,
  tone = "normal",
  value,
}: {
  monospace?: boolean;
  title: string;
  tone?: "error" | "normal";
  value: string;
}) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <div
        className={cn(
          "mt-0.5 max-w-full break-words text-muted-foreground [overflow-wrap:anywhere]",
          monospace && "font-mono break-all",
          tone === "error" && "font-medium text-status-critical",
        )}
      >
        {value}
      </div>
    </section>
  );
}

function ActivityPreBlock({ title, value }: { title: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <pre className="mt-1 max-h-32 w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto rounded-sm border border-border bg-popover p-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </pre>
    </section>
  );
}

function ActivityJSONDetails({ details }: { details: unknown }) {
  const text = activityDetailsText(details);
  if (!text) {
    return null;
  }
  return <ActivityPreBlock title="Details" value={text} />;
}

function activityDetailsText(details: unknown) {
  if (details === null || details === undefined) {
    return "";
  }
  if (Array.isArray(details) && details.length === 0) {
    return "";
  }
  if (isRecord(details) && Object.keys(details).length === 0) {
    return "";
  }
  return JSON.stringify(details, null, 2);
}

function ActivityExit({ durationMs, exitCode }: { durationMs: number; exitCode: number }) {
  if (exitCode <= 0 && durationMs <= 0) {
    return null;
  }
  return (
    <ActivityTextBlock
      title="Exit"
      value={`${exitCode > 0 ? `exit ${exitCode}` : "exit 0"}${durationMs > 0 ? ` / ${durationMs}ms` : ""}`}
    />
  );
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

function ActivityGroupStatus({ status }: { status: RunItemStatus }) {
  if (status !== "running" && status !== "pending") {
    return null;
  }
  return <BrailleSpinner className="text-accent-violet" label="Activity running" />;
}

function ActivityRowStatus({ status, title }: { status: RunItemStatus; title: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      {status === "running" || status === "pending" ? (
        <BrailleSpinner className="text-accent-violet" label={`${title} running`} />
      ) : null}
      <span>{status}</span>
    </span>
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
