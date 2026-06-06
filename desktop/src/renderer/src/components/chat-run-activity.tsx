import type { RunItem, RunItemOutput, RunItemType } from "@generated/backend";
import {
  AlertTriangle,
  Archive,
  FileText,
  ListChecks,
  Terminal,
  type LucideIcon,
  Wrench,
} from "lucide-react";

import { Button } from "./ui/button";
import type { RunItemOutputPageState } from "../stores/chat-store";

const activityLabelByType = {
  agent_message: "assistant message",
  approval_review: "approval review",
  collab_agent_tool_call: "collab agent tool call",
  command_execution: "command execution",
  context_compaction: "context compaction",
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
  agent_message: "h-4 w-4 shrink-0 text-zinc-500",
  approval_review: "h-4 w-4 shrink-0 text-amber-600",
  collab_agent_tool_call: "h-4 w-4 shrink-0 text-zinc-500",
  command_execution: "h-4 w-4 shrink-0 text-zinc-500",
  context_compaction: "h-4 w-4 shrink-0 text-zinc-500",
  diff: "h-4 w-4 shrink-0 text-zinc-500",
  dynamic_tool_call: "h-4 w-4 shrink-0 text-zinc-500",
  file_change: "h-4 w-4 shrink-0 text-zinc-500",
  hook: "h-4 w-4 shrink-0 text-zinc-500",
  image_generation: "h-4 w-4 shrink-0 text-zinc-500",
  image_view: "h-4 w-4 shrink-0 text-zinc-500",
  mcp_tool_call: "h-4 w-4 shrink-0 text-zinc-500",
  notice: "h-4 w-4 shrink-0 text-amber-600",
  plan: "h-4 w-4 shrink-0 text-zinc-500",
  reasoning: "h-4 w-4 shrink-0 text-zinc-500",
  structured_input: "h-4 w-4 shrink-0 text-zinc-500",
  terminal_interaction: "h-4 w-4 shrink-0 text-zinc-500",
  web_search: "h-4 w-4 shrink-0 text-zinc-500",
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
  return (
    <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
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
      className="group rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
      data-testid="run-activity-row"
      onToggle={(event) => {
        if (!event.currentTarget.open || outputPage?.loading || outputPage) {
          return;
        }
        void loadRunItemOutput(item.runId, item.id, 0);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <ActivityIcon type={item.type} />
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
          {activityTitle(item)}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{item.status}</span>
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
    <div className="mt-2 space-y-2 text-xs text-zinc-600">
      <RunActivityCwd cwd={item.cwd} />
      <RunActivityCommand command={item.command} />
      <RunActivityFiles paths={item.filePaths} />
      <RunActivityMetadata item={item} />
      <OptionalRunActivityText value={item.progress} />
      <OptionalRunActivityText value={item.result} />
      <OptionalRunActivityText className="font-medium text-red-600" value={item.error} />
      <OptionalRunActivityText value={item.noticeMessage} />
      <OptionalRunActivityText value={item.diffSummary} />
      <RunActivityJSONDetails details={item.details} />
      <RunActivityExit durationMs={item.durationMs} exitCode={item.exitCode} />
      <RunActivityOutput
        loadMoreOutput={loadMoreOutput}
        outputPage={outputPage}
        outputText={outputText}
      />
    </div>
  );
}

function RunActivityCwd({ cwd }: { cwd: string }) {
  if (!cwd) {
    return null;
  }
  return <div className="break-all font-mono">{cwd}</div>;
}

function RunActivityCommand({ command }: { command: string }) {
  if (!command) {
    return null;
  }
  return (
    <pre className="max-h-28 overflow-auto rounded border border-zinc-200 bg-white p-2">
      {command}
    </pre>
  );
}

function RunActivityFiles({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      {paths.map((path) => (
        <div className="break-all font-mono" key={path}>
          {path}
        </div>
      ))}
    </div>
  );
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
          className="max-w-full truncate rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono"
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

function OptionalRunActivityText({ className, value }: { className?: string; value: string }) {
  if (!value) {
    return null;
  }
  return <div className={className}>{value}</div>;
}

function RunActivityJSONDetails({ details }: { details: unknown }) {
  const text = runActivityDetailsText(details);
  if (!text) {
    return null;
  }
  return (
    <pre className="max-h-32 overflow-auto rounded border border-zinc-200 bg-white p-2">{text}</pre>
  );
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
    <div>
      {exitCode > 0 ? `exit ${exitCode}` : "exit 0"}
      {durationMs > 0 ? ` / ${durationMs}ms` : ""}
    </div>
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
    <div className="space-y-2">
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
  return (
    <pre className="max-h-32 overflow-auto rounded border border-zinc-200 bg-white p-2">
      {outputText}
    </pre>
  );
}

function RunActivityOutputError({
  outputPage,
}: {
  outputPage: RunItemOutputPageState | undefined;
}) {
  if (!outputPage?.error) {
    return null;
  }
  return <div className="font-medium text-red-600">{outputPage.error}</div>;
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
  return <div className="text-zinc-500">Loading output...</div>;
}

function ActivityIcon({ type }: { type: RunItemType }) {
  const Icon = activityIconByType[type];
  return <Icon className={activityIconClassByType[type]} />;
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
