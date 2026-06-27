import type { RunItemOutput, TranscriptBlock, TranscriptBlockStatus } from "@generated/backend";
import { Ban, Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import type { TranscriptRenderRow } from "../lib/chat-transcript-render-rows";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import {
  ActivityItemRow,
  activityRowOutputs,
  type LoadRunItemOutput,
  TranscriptActivityGroupSlot,
} from "./chat-transcript-activity";
import {
  AssistantTextBlock,
  QueuedMessageRow,
  StandaloneMessageRow,
  UserMessageBlock,
} from "./chat-transcript-message-block";
import { ReasoningBlock } from "./chat-transcript-reasoning-block";
import type { TranscriptRowActions } from "./chat-transcript-row-actions";

// Shared, render-scoped context every transcript row needs: search highlight,
// message-row actions, the lifted activity expand state (so the group slot can
// bulk-toggle rows virtualization has not mounted), deep-link focus, and lazy
// output state keyed by source run item ID.
export interface TranscriptRowContext {
  activeSearchId: string | null;
  rowActions: TranscriptRowActions;
  expandedActivityBlockIds: Set<string>;
  setActivityRowExpanded: (blockId: string, open: boolean) => void;
  setActivityRowsExpanded: (blockIds: string[], open: boolean) => void;
  focusedSourceRunItemId: string | null;
  loadRunItemOutput: LoadRunItemOutput;
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputsById: Record<string, RunItemOutput>;
}

// TranscriptRenderRowView renders one virtual transcript row. Activity rows and
// their derived group slot are render-only rows; every other row maps to a typed
// transcript block.
export function TranscriptRenderRowView({
  context,
  row,
}: {
  context: TranscriptRowContext;
  row: TranscriptRenderRow;
}) {
  switch (row.kind) {
    case "block":
      return (
        <TranscriptBlockView
          activeSearchId={context.activeSearchId}
          block={row.block}
          rowActions={context.rowActions}
          showTimestamp={row.showTimestamp}
        />
      );
    case "activity-group":
      return <ActivityGroupSlotRow context={context} row={row} />;
    case "activity-item":
      return <ActivityItemRowSlot context={context} row={row} />;
    case "message":
      return (
        <StandaloneMessageRow
          activeSearchId={context.activeSearchId}
          message={row.message}
          rowActions={context.rowActions}
          showTimestamp={row.showTimestamp}
        />
      );
    case "queued":
      return <QueuedMessageRow message={row.message} rowActions={context.rowActions} />;
    default:
      return assertNever(row);
  }
}

function TranscriptBlockView({
  activeSearchId,
  block,
  rowActions,
  showTimestamp,
}: {
  activeSearchId: string | null;
  block: TranscriptBlock;
  rowActions: TranscriptRowActions;
  showTimestamp: boolean;
}) {
  switch (block.kind) {
    case "user_message":
      return (
        <UserMessageBlock
          activeSearchId={activeSearchId}
          block={block}
          rowActions={rowActions}
          showTimestamp={showTimestamp}
        />
      );
    case "assistant_text":
      return (
        <AssistantTextBlock
          activeSearchId={activeSearchId}
          block={block}
          rowActions={rowActions}
          showTimestamp={showTimestamp}
        />
      );
    case "reasoning":
      return <ReasoningBlock block={block} />;
    case "run_status":
      return <RunStatusBlock block={block} />;
    case "activity_item":
      // Activity blocks render as grouped activity-item rows, never as a plain block.
      return null;
    default:
      return assertNever(block.kind);
  }
}

function ActivityItemRowSlot({
  context,
  row,
}: {
  context: TranscriptRowContext;
  row: Extract<TranscriptRenderRow, { kind: "activity-item" }>;
}) {
  const sourceRunItemId = row.block.activity?.sourceRunItemId ?? "";
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div className="ml-1.5 border-l border-border/70 pl-2.5">
        <ActivityItemRow
          block={row.block}
          expanded={context.expandedActivityBlockIds.has(row.block.id)}
          focused={sourceRunItemId !== "" && context.focusedSourceRunItemId === sourceRunItemId}
          loadRunItemOutput={context.loadRunItemOutput}
          onExpandedChange={(open) => context.setActivityRowExpanded(row.block.id, open)}
          outputPage={context.outputPagesByRunItemId[sourceRunItemId]}
          outputs={activityRowOutputs(
            context.outputIdsByRunItemId,
            context.outputsById,
            sourceRunItemId,
          )}
        />
      </div>
    </div>
  );
}

function ActivityGroupSlotRow({
  context,
  row,
}: {
  context: TranscriptRowContext;
  row: Extract<TranscriptRenderRow, { kind: "activity-group" }>;
}) {
  const expandableBlockIds = row.members
    .filter(
      (member) => member.activity && (member.activity.hasDetails || member.activity.hasOutput),
    )
    .map((member) => member.id);
  const focusVisible = row.members.some(
    (member) =>
      context.focusedSourceRunItemId !== null &&
      member.activity?.sourceRunItemId === context.focusedSourceRunItemId,
  );
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <TranscriptActivityGroupSlot
        category={row.group.category}
        controlsVisible={focusVisible}
        count={row.group.count}
        expandableBlockIds={expandableBlockIds}
        expandedBlockIds={context.expandedActivityBlockIds}
        onBulkToggle={context.setActivityRowsExpanded}
        status={row.group.status}
      />
    </div>
  );
}

// run_status carries a live-only working indicator (never persisted) and the
// permanent terminal modes. The working tail spins; terminal modes render a slim
// fixed-height status row that matches block heights so reload keeps the layout.
function RunStatusBlock({ block }: { block: TranscriptBlock }) {
  const runStatus = block.runStatus;
  if (!runStatus) {
    return null;
  }
  if (runStatus.mode === "working") {
    return (
      <RunStatusRow
        mode="working"
        runId={block.runId}
        tone="muted"
        icon={<BrailleSpinner label={runStatus.label} />}
      >
        <span className="italic">{runStatus.label}</span>
      </RunStatusRow>
    );
  }
  return (
    <RunStatusRow
      mode={runStatus.mode}
      runId={block.runId}
      tone={runStatus.mode === "failed" ? "error" : "muted"}
      icon={<TerminalRunStatusIcon status={block.status} />}
    >
      <span>{runStatus.label}</span>
      {runStatus.error !== "" ? (
        <span className="min-w-0 truncate text-status-critical">{runStatus.error}</span>
      ) : null}
    </RunStatusRow>
  );
}

function RunStatusRow({
  children,
  icon,
  mode,
  runId,
  tone,
}: {
  children: ReactNode;
  icon: ReactNode;
  mode: string;
  runId: string;
  tone: "error" | "muted";
}) {
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div
        className={cn(
          "flex h-6 min-w-0 items-center gap-2 text-xs",
          tone === "error" ? "text-status-critical" : "text-muted-foreground",
        )}
        data-block-kind="run_status"
        data-run-id={runId}
        data-run-status-mode={mode}
        data-transcript-block="true"
      >
        {icon}
        {children}
      </div>
    </div>
  );
}

function TerminalRunStatusIcon({ status }: { status: TranscriptBlockStatus }) {
  if (status === "failed") {
    return <CircleAlert className="h-4 w-4 shrink-0 text-status-critical" />;
  }
  if (status === "cancelled") {
    return <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <Check className="h-4 w-4 shrink-0 text-status-success" />;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript render row: ${JSON.stringify(value)}`);
}
