import type { RunItem, RunItemOutput, RunItemType } from "@generated/backend";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  FileText,
  ListChecks,
  Terminal,
  type LucideIcon,
  Wrench,
} from "lucide-react";

import { cn } from "../lib/utils";
import { BrailleSpinner } from "./ascii-spinner";
import { Button } from "./ui/button";
import type { RunItemOutputPageState } from "../stores/chat-store";

const activityLabelByType = {
  agent_message: "assistant message",
  approval_review: "approval review",
  collab_agent_tool_call: "collab agent tool call",
  command_execution: "command execution",
  diff: "diff",
  dynamic_tool_call: "dynamic tool call",
  file_change: "file change",
  hook: "hook",
  image_generation: "image generation",
  image_view: "image view",
  mcp_tool_call: "mcp tool call",
  notice: "notice",
  plan: "plan",
  reasoning: "reasoning",
  structured_input: "structured input",
  terminal_interaction: "terminal interaction",
  web_search: "web search",
} satisfies Record<RunItemType, string>;

const activityIconByType = {
  agent_message: Wrench,
  approval_review: AlertTriangle,
  collab_agent_tool_call: Wrench,
  command_execution: Terminal,
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
  approval_review: "h-4 w-4 shrink-0 text-status-warning",
  collab_agent_tool_call: "h-4 w-4 shrink-0 text-muted-foreground",
  command_execution: "h-4 w-4 shrink-0 text-muted-foreground",
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
  items,
  loadRunItemOutput,
  outputIdsByRunItemId,
  outputPagesByRunItemId,
  outputsById,
}: {
  items: RunItem[];
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
  if (items.length === 0) {
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
          {items.length}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">Activity</span>
        <RunActivityGroupStatus items={items} />
      </summary>
      <div className="mt-1.5 min-w-0 space-y-1.5 border-l border-border/70 pl-2">
        {items.map((item) => (
          <RunActivityRow
            item={item}
            key={item.id}
            loadRunItemOutput={loadRunItemOutput}
            outputPage={outputPagesByRunItemId[item.id]}
            outputs={outputsForItem(outputIdsByRunItemId, outputsById, item.id)}
          />
        ))}
      </div>
    </details>
  );
}

function RunActivityRow({
  item,
  loadRunItemOutput,
  outputPage,
  outputs,
}: {
  item: RunItem;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  outputPage: RunItemOutputPageState | undefined;
  outputs: RunItemOutput[];
}) {
  const outputText = outputPreview(outputs);
  return (
    <details
      className="group/item relative w-full min-w-0 max-w-full overflow-hidden rounded-sm text-xs text-foreground"
      data-testid="run-activity-row"
      onToggle={(event) => {
        if (!event.currentTarget.open || outputPage?.loading || outputPage) {
          return;
        }
        void loadRunItemOutput(item.runId, item.id, 0);
      }}
    >
      <summary className="flex h-6 min-w-0 cursor-pointer list-none items-center gap-1.5 text-left text-xs text-muted-foreground marker:hidden">
        <ActivityIcon type={item.type} />
        <ToolDisclosureIcon />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
          {activityTitle(item)}
        </span>
        <RunActivityStatus item={item} />
      </summary>
      <RunActivityDetails
        item={item}
        loadMoreOutput={() =>
          void loadRunItemOutput(item.runId, item.id, outputPage?.nextOrdinal ?? 0)
        }
        outputPage={outputPage}
        outputText={outputText}
      />
    </details>
  );
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
  item,
  loadMoreOutput,
  outputPage,
  outputText,
}: {
  item: RunItem;
  loadMoreOutput: () => void;
  outputPage: RunItemOutputPageState | undefined;
  outputText: string;
}) {
  return (
    <div className="mt-1.5 w-full min-w-0 max-w-full overflow-hidden border-l border-border/70 pl-2">
      <div className="w-full min-w-0 max-w-full overflow-hidden space-y-1.5 text-xs text-muted-foreground">
        <RunActivityCwd cwd={item.cwd} />
        <RunActivityCommand command={item.command} />
        <RunActivityFiles paths={item.filePaths} />
        <RunActivityMetadata item={item} />
        <RunActivityTextBlock title="Progress" value={item.progress} />
        <RunActivityTextBlock title="Result" value={item.result} />
        <RunActivityTextBlock tone="error" title="Error" value={item.error} />
        <RunActivityTextBlock title="Notice" value={item.noticeMessage} />
        <RunActivityTextBlock title="Diff" value={item.diffSummary} />
        <RunActivityJSONDetails details={item.details} />
        <RunActivityExit durationMs={item.durationMs} exitCode={item.exitCode} />
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

function RunActivityMetadata({ item }: { item: RunItem }) {
  const entries = runActivityMetadata(item);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span
          className="max-w-full truncate rounded-sm border border-border bg-popover px-2 py-0.5 font-mono text-muted-foreground"
          key={entry.label}
        >
          {entry.label}: {entry.value}
        </span>
      ))}
    </div>
  );
}

function runActivityMetadata(item: RunItem) {
  return [
    { label: "namespace", value: item.namespace },
    { label: "process", value: item.processId },
    { label: "request", value: item.requestId },
    { label: "review", value: item.reviewId },
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
      <h4 className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {title}
      </h4>
      <div
        className={cn(
          "mt-0.5 break-words text-muted-foreground",
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
      <h4 className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {title}
      </h4>
      <pre className="mt-1 max-h-32 w-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-popover p-2 font-mono text-xs leading-5 text-muted-foreground">
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
    <div className="w-full min-w-0 max-w-full overflow-hidden space-y-2">
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

function RunActivityGroupStatus({ items }: { items: RunItem[] }) {
  const running = items.some((item) => item.status === "pending" || item.status === "running");
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      {running ? (
        <BrailleSpinner className="text-muted-foreground" label="Activity running" />
      ) : null}
      <span>{activityGroupStatus(items)}</span>
    </span>
  );
}

function activityGroupStatus(items: RunItem[]) {
  if (items.some((item) => item.status === "failed")) {
    return "failed";
  }
  if (items.some((item) => item.status === "cancelled")) {
    return "cancelled";
  }
  if (items.some((item) => item.status === "pending" || item.status === "running")) {
    return "running";
  }
  return "completed";
}

function RunActivityStatus({ item }: { item: RunItem }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      {item.status === "running" || item.status === "pending" ? (
        <BrailleSpinner
          className="text-muted-foreground"
          label={`${activityTitle(item)} running`}
        />
      ) : null}
      <span>{item.status}</span>
    </span>
  );
}

function activityTitle(item: RunItem) {
  if (item.title) {
    return item.title;
  }
  if (item.command) {
    return item.command;
  }
  if (item.toolName) {
    return item.serverName ? `${item.serverName}.${item.toolName}` : item.toolName;
  }
  if (item.noticeKind) {
    return item.noticeKind;
  }
  if (item.summary) {
    return item.summary;
  }
  return activityLabelByType[item.type];
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
