import type {
  RunActivityDetailsProjection,
  RunActivityGroupProjection,
  RunActivityRowProjection,
  RunItemOutput,
  RunItemType,
} from "@generated/backend";
import {
  AlertTriangle,
  Archive,
  Bot,
  ChevronDown,
  ChevronUp,
  FileText,
  ListChecks,
  Terminal,
  type LucideIcon,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import { BrailleSpinner } from "./ascii-spinner";
import { Button } from "./ui/button";

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
  web_search: Wrench,
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

export function RunActivityRows({
  activity,
  highlightedRunItemId,
  loadRunItemOutput,
  outputIdsByRunItemId,
  outputPagesByRunItemId,
  outputsById,
}: {
  activity: RunActivityGroupProjection;
  highlightedRunItemId?: string;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputsById: Record<string, RunItemOutput>;
}) {
  if (activity.rows.length === 0) {
    return null;
  }
  return (
    <details
      className="group/activity mt-3 w-full min-w-0 max-w-full overflow-hidden border-t border-border/80 pt-2.5 text-xs text-foreground"
      data-testid="run-activity-group"
      open
    >
      <summary className="flex h-7 min-w-0 cursor-pointer list-none items-center gap-1.5 text-left text-xs text-muted-foreground marker:hidden">
        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
        <ActivityGroupDisclosureIcon />
        <span className="rounded-sm border border-border bg-popover px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {activity.rows.length}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">Activity</span>
        <RunActivityGroupStatus activity={activity} />
      </summary>
      <div className="mt-1.5 min-w-0 space-y-1.5 border-l border-border/70 pl-2">
        {activity.rows.map((row) => (
          <RunActivityRow
            focused={
              highlightedRunItemId !== undefined && row.sourceRunItemId === highlightedRunItemId
            }
            key={row.id}
            loadRunItemOutput={loadRunItemOutput}
            outputPage={outputPagesByRunItemId[row.sourceRunItemId]}
            outputs={outputsForItem(outputIdsByRunItemId, outputsById, row.sourceRunItemId)}
            row={row}
            runId={activity.runId}
          />
        ))}
      </div>
    </details>
  );
}

function RunActivityRow({
  focused = false,
  loadRunItemOutput,
  outputPage,
  outputs,
  row,
  runId,
}: {
  focused?: boolean;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  outputPage: RunItemOutputPageState | undefined;
  outputs: RunItemOutput[];
  row: RunActivityRowProjection;
  runId: string;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDetailsElement>(null);
  useFocusedRunActivityRow(focused, rowRef, setOpen);
  if (!hasExpandableActivityRow(row)) {
    return <CompactRunActivityRow focused={focused} row={row} />;
  }
  const renderDetails = shouldRenderActivityDetails(open, focused, row, outputs);
  const outputText = renderDetails ? outputPreview(outputs) : "";
  return (
    <details
      className={cn(
        "group/item relative w-full min-w-0 max-w-full overflow-hidden rounded-sm text-xs text-foreground",
        focused && "ring-2 ring-accent-violet/70 ring-offset-1 ring-offset-background",
      )}
      data-activity-focus-id={focused ? `run-item:${row.sourceRunItemId}` : undefined}
      data-activity-focused={focused ? "true" : undefined}
      data-run-item-id={row.sourceRunItemId}
      data-testid="run-activity-row"
      ref={rowRef}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (!shouldLoadActivityOutput(nextOpen, row, outputPage)) {
          return;
        }
        void loadRunItemOutput(runId, row.sourceRunItemId, 0);
      }}
    >
      <summary className="flex h-6 min-w-0 cursor-pointer list-none items-center gap-1.5 text-left text-xs text-muted-foreground marker:hidden">
        <ActivityIcon type={row.type} />
        <ToolDisclosureIcon />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
          {row.title}
        </span>
        <RunActivityStatus row={row} />
      </summary>
      {renderDetails ? (
        <RunActivityDetails
          details={row.details}
          loadMoreOutput={() =>
            void loadRunItemOutput(runId, row.sourceRunItemId, outputPage?.nextOrdinal ?? 0)
          }
          outputPage={outputPage}
          outputText={outputText}
        />
      ) : null}
    </details>
  );
}

function useFocusedRunActivityRow(
  focused: boolean,
  rowRef: RefObject<HTMLDetailsElement | null>,
  setOpen: (open: boolean) => void,
) {
  // A deep-linked row opens and scrolls into view. The native disclosure stays uncontrolled, so the
  // open state is nudged through the element ref rather than a declarative `open` attribute.
  useEffect(() => {
    if (!focused) {
      return;
    }
    if (rowRef.current !== null) {
      rowRef.current.open = true;
    }
    setOpen(true);
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [focused, rowRef, setOpen]);
}

function hasExpandableActivityRow(row: RunActivityRowProjection) {
  return row.hasDetails || row.hasOutput;
}

function shouldRenderActivityDetails(
  open: boolean,
  focused: boolean,
  row: RunActivityRowProjection,
  outputs: RunItemOutput[],
) {
  if (open || focused) {
    return true;
  }
  return shouldRenderClosedActivityDetails(row, outputs);
}

function shouldLoadActivityOutput(
  open: boolean,
  row: RunActivityRowProjection,
  outputPage: RunItemOutputPageState | undefined,
) {
  if (!open || !row.hasOutput || outputPage?.loading) {
    return false;
  }
  return outputPage === undefined;
}

function CompactRunActivityRow({
  focused = false,
  row,
}: {
  focused?: boolean;
  row: RunActivityRowProjection;
}) {
  return (
    <div
      className={cn(
        "relative flex h-6 w-full min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded-sm text-xs text-muted-foreground",
        focused && "ring-2 ring-accent-violet/70 ring-offset-1 ring-offset-background",
      )}
      data-activity-focus-id={focused ? `run-item:${row.sourceRunItemId}` : undefined}
      data-activity-focused={focused ? "true" : undefined}
      data-run-item-id={row.sourceRunItemId}
      data-testid="run-activity-row"
    >
      <ActivityIcon type={row.type} />
      <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">{row.title}</span>
      <RunActivityStatus row={row} />
    </div>
  );
}

function shouldRenderClosedActivityDetails(
  row: RunActivityRowProjection,
  outputs: RunItemOutput[],
) {
  if (row.status !== "pending" && row.status !== "running") {
    return true;
  }
  return outputs.length === 0;
}

function ActivityGroupDisclosureIcon() {
  return (
    <>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-open/activity:hidden" />
      <ChevronUp className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground group-open/activity:block" />
    </>
  );
}

function RunActivityDetails({
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
    <div className="mt-1.5 w-full min-w-0 max-w-full overflow-hidden border-l border-border/70 pl-2">
      <div className="w-full min-w-0 max-w-full space-y-1.5 overflow-hidden text-xs text-muted-foreground">
        <RunActivityCwd cwd={details.cwd} />
        <RunActivityCommand command={details.command} />
        <RunActivityFiles paths={details.filePaths} />
        <RunActivityMetadata details={details} />
        <RunActivityTextBlock title="Summary" value={details.summary} />
        <RunActivityTextBlock title="Progress" value={details.progress} />
        <RunActivityTextBlock title="Result" value={details.result} />
        <RunActivityTextBlock title="Error" tone="error" value={details.error} />
        <RunActivityTextBlock title="Notice" value={details.noticeMessage} />
        <RunActivityTextBlock title="Diff" value={details.diffSummary} />
        <RunActivityJSONDetails details={details.details} />
        <RunActivityExit durationMs={details.durationMs} exitCode={details.exitCode} />
        <RunActivityOutput
          loadMoreOutput={loadMoreOutput}
          outputPage={outputPage}
          outputText={outputText}
        />
      </div>
    </div>
  );
}

function RunActivityCwd({ cwd }: { cwd: string }) {
  if (!cwd) {
    return null;
  }
  return <RunActivityTextBlock monospace title="Cwd" value={cwd} />;
}

function RunActivityCommand({ command }: { command: string }) {
  if (!command) {
    return null;
  }
  return <RunActivityPreBlock title="Command" value={command} />;
}

function RunActivityFiles({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }
  return <RunActivityPreBlock title="Files" value={paths.join("\n")} />;
}

function RunActivityMetadata({ details }: { details: RunActivityDetailsProjection }) {
  const entries = runActivityMetadata(details);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span
          className="min-w-0 max-w-full truncate rounded-sm border border-border bg-popover px-2 py-0.5 font-mono text-muted-foreground"
          key={entry.label}
        >
          {entry.label}: {entry.value}
        </span>
      ))}
    </div>
  );
}

function runActivityMetadata(details: RunActivityDetailsProjection) {
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

function RunActivityTextBlock({
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
          monospace && "break-all font-mono",
          tone === "error" && "font-medium text-status-critical",
        )}
      >
        {value}
      </div>
    </section>
  );
}

function RunActivityPreBlock({ title, value }: { title: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <section className="min-w-0">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase">{title}</h4>
      <pre className="mt-1 max-h-32 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap rounded-sm border border-border bg-popover p-2 font-mono text-xs leading-5 break-words text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </pre>
    </section>
  );
}

function RunActivityJSONDetails({ details }: { details: unknown }) {
  const text = runActivityDetailsText(details);
  if (!text) {
    return null;
  }
  return <RunActivityPreBlock title="Details" value={text} />;
}

function runActivityDetailsText(details: unknown) {
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

function RunActivityExit({ durationMs, exitCode }: { durationMs: number; exitCode: number }) {
  if (exitCode <= 0 && durationMs <= 0) {
    return null;
  }
  return (
    <RunActivityTextBlock
      title="Exit"
      value={`${exitCode > 0 ? `exit ${exitCode}` : "exit 0"}${durationMs > 0 ? ` / ${durationMs}ms` : ""}`}
    />
  );
}

function RunActivityOutput({
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  if (!hasRunActivityOutput(outputText, outputPage)) {
    return null;
  }
  return (
    <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden">
      <RunActivityOutputText outputText={outputText} />
      <RunActivityOutputError outputPage={outputPage} />
      <RunActivityOutputLoadMore loadMoreOutput={loadMoreOutput} outputPage={outputPage} />
      <RunActivityOutputLoading outputPage={outputPage} />
    </div>
  );
}

function hasRunActivityOutput(outputText: string, outputPage: RunItemOutputPageState | undefined) {
  return Boolean(outputText || outputPage?.hasMore || outputPage?.loading || outputPage?.error);
}

function RunActivityOutputText({ outputText }: { outputText: string }) {
  if (!outputText) {
    return null;
  }
  return <RunActivityPreBlock title="Output" value={outputText} />;
}

function RunActivityOutputError({
  outputPage,
}: {
  outputPage: RunItemOutputPageState | undefined;
}) {
  if (!outputPage?.error) {
    return null;
  }
  return <div className="font-medium text-status-critical">{outputPage.error}</div>;
}

function RunActivityOutputLoadMore({
  loadMoreOutput,
  outputPage,
}: {
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
}) {
  if (!outputPage?.hasMore) {
    return null;
  }
  return (
    <Button
      className="border-border bg-background text-foreground hover:bg-accent"
      disabled={outputPage.loading}
      onClick={loadMoreOutput}
      type="button"
      variant="secondary"
    >
      Load more
    </Button>
  );
}

function RunActivityOutputLoading({
  outputPage,
}: {
  outputPage: RunItemOutputPageState | undefined;
}) {
  if (!outputPage?.loading) {
    return null;
  }
  return <BrailleSpinner className="text-muted-foreground" label="Loading tool output" />;
}

function ActivityIcon({ type }: { type: RunItemType }) {
  const Icon = activityIconByType[type];
  return <Icon className={activityIconClassByType[type]} />;
}

function ToolDisclosureIcon() {
  return (
    <>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-open/item:hidden" />
      <ChevronUp className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground group-open/item:block" />
    </>
  );
}

function RunActivityGroupStatus({ activity }: { activity: RunActivityGroupProjection }) {
  const running = activity.status === "running";
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      {running ? <BrailleSpinner className="text-accent-violet" label="Activity running" /> : null}
      <span>{activity.status}</span>
    </span>
  );
}

function RunActivityStatus({ row }: { row: RunActivityRowProjection }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      {row.status === "running" || row.status === "pending" ? (
        <BrailleSpinner className="text-accent-violet" label={`${row.title} running`} />
      ) : null}
      <span>{row.status}</span>
    </span>
  );
}

function outputsForItem(
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
  return text.slice(0, 2000) + "\n...";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
