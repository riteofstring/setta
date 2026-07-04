import type {
  RunLiveness,
  RunItemOutput,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";
import { Ban, Check, CircleAlert, RefreshCw, SquareTerminal, WifiOff } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";

import {
  activeRunPresentation,
  runLivenessPresentationLabel,
  type RunLivenessPresentationKind,
} from "../lib/chat-run-liveness";
import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import type { TranscriptRenderRow } from "../lib/chat-transcript-render-rows";
import { BrailleSpinner } from "./ascii-spinner";
import { chatReadableColumnAttributes, chatReadableColumnPaddedClass } from "./chat-layout";
import {
  ActivityItemRow,
  activityRowOutputs,
  type LoadRunItemOutput,
  TranscriptActivityGroupHeader,
} from "./chat-transcript-activity";
import {
  AssistantTextBlock,
  QueuedMessageRow,
  StandaloneMessageRow,
  UserMessageBlock,
} from "./chat-transcript-message-block";
import { ReasoningBlock } from "./chat-transcript-reasoning-block";
import { LiveHeadlineText } from "./live-headline-text";
import type { TranscriptRowActions } from "./chat-transcript-row-actions";
import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";

// Shared, render-scoped context every transcript row needs: search highlight,
// message-row actions, the lifted activity expand state (so the group slot can
// bulk-toggle rows virtualization has not mounted), deep-link focus, and lazy
// output state keyed by source run item ID.
export interface TranscriptRowContext {
  activeSearchId: string | null;
  activeRunLiveness: RunLiveness | null;
  activeCurrentPlanTarget: CurrentPlanSurfaceTarget | null;
  detachTranscriptScroll: () => void;
  rowActions: TranscriptRowActions;
  expandedActivityBlockIds: Set<string>;
  expandedActivityGroupIds: Set<string>;
  setActivityRowExpanded: (blockId: string, open: boolean) => void;
  setActivityRowsExpanded: (blockIds: string[], open: boolean) => void;
  setActivityGroupExpanded: (groupId: string, open: boolean) => void;
  focusedSourceRunItemId: string | null;
  loadRunItemOutput?: LoadRunItemOutput;
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputsById: Record<string, RunItemOutput>;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
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
      return <RunStatusBlock block={block} rowActions={rowActions} />;
    case "background_terminal":
      return <BackgroundTerminalBlock block={block} />;
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
  const focused =
    context.activeSearchId === row.block.id ||
    (sourceRunItemId !== "" && context.focusedSourceRunItemId === sourceRunItemId);
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div
        className="border-l border-border/70 py-0.5 pl-2"
        data-testid="activity-group-member-row"
      >
        <ActivityItemRow
          block={row.block}
          expanded={context.expandedActivityBlockIds.has(row.block.id)}
          focused={focused}
          activeCurrentPlanTarget={context.activeCurrentPlanTarget}
          loadRunItemOutput={context.loadRunItemOutput}
          onOpenCurrentPlanSurface={context.onOpenCurrentPlanSurface}
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
  const groupRowRef = useRef<HTMLDivElement>(null);
  const expandableMembers = row.members.filter(isExpandableActivityMember);
  const expandAllOpen =
    expandableMembers.length > 0 &&
    expandableMembers.every((member) => context.expandedActivityBlockIds.has(member.id));
  const setExpandAll = (members: TranscriptBlock[], open: boolean) => {
    preserveActivityGroupAnchor(groupRowRef.current, context.detachTranscriptScroll, () => {
      context.setActivityGroupExpanded(row.group.id, open);
      context.setActivityRowsExpanded(
        members.map((member) => member.id),
        open,
      );
    });
    if (!open) {
      return;
    }
    for (const member of members) {
      const sourceRunItemId = member.activity?.sourceRunItemId ?? "";
      if (
        shouldLoadExpandedActivityGroupMemberOutput(
          member,
          context.outputPagesByRunItemId[sourceRunItemId],
        )
      ) {
        if (context.loadRunItemOutput) {
          void context.loadRunItemOutput(member.runId, sourceRunItemId, 0);
        }
      }
    }
  };
  const setGroupExpanded = (open: boolean) => {
    preserveActivityGroupAnchor(groupRowRef.current, context.detachTranscriptScroll, () => {
      context.setActivityGroupExpanded(row.group.id, open);
      if (!open) {
        context.setActivityRowsExpanded(
          expandableMembers.map((member) => member.id),
          false,
        );
      }
    });
  };
  return (
    <div
      {...chatReadableColumnAttributes}
      className={chatReadableColumnPaddedClass}
      ref={groupRowRef}
    >
      <TranscriptActivityGroupHeader
        expandAllOpen={expandAllOpen}
        expanded={row.expanded}
        members={row.members}
        onExpandAll={setExpandAll}
        onExpandedChange={setGroupExpanded}
      />
    </div>
  );
}

function preserveActivityGroupAnchor(
  anchor: HTMLElement | null,
  detachTranscriptScroll: () => void,
  update: () => void,
) {
  detachTranscriptScroll();
  if (anchor === null) {
    update();
    return;
  }
  const scroller = anchor.closest<HTMLElement>('[data-testid="chat-transcript-scroller"]');
  const top = anchor.getBoundingClientRect().top;
  flushSync(update);
  let remainingFrames = 8;
  const correctAnchor = () => {
    if (scroller === null || !scroller.isConnected || !anchor.isConnected) {
      return;
    }
    const delta = anchor.getBoundingClientRect().top - top;
    if (Math.abs(delta) > 0.5) {
      scroller.scrollTop += delta;
    }
    remainingFrames -= 1;
    if (remainingFrames > 0) {
      requestAnimationFrame(correctAnchor);
    }
  };
  correctAnchor();
}

function isExpandableActivityMember(member: TranscriptBlock) {
  const activity = member.activity;
  return activity !== null && (activity.hasDetails || activity.hasOutput);
}

function shouldLoadExpandedActivityGroupMemberOutput(
  member: TranscriptBlock,
  outputPage: RunItemOutputPageState | undefined,
) {
  const activity = member.activity;
  return activity !== null && activity.hasOutput && activity.sourceRunItemId !== "" && !outputPage;
}

// run_status carries a live-only working indicator (never persisted) and the
// permanent terminal modes. The working tail spins; terminal modes render a slim
// fixed-height status row that matches block heights so reload keeps the layout.
function RunStatusBlock({
  block,
  rowActions,
}: {
  block: TranscriptBlock;
  rowActions: TranscriptRowActions;
}) {
  const runStatus = block.runStatus;
  if (!runStatus) {
    return null;
  }
  if (runStatus.mode === "working") {
    return <LiveRunStatusBlock block={block} rowActions={rowActions} />;
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

function LiveRunStatusBlock({
  block,
  rowActions,
}: {
  block: TranscriptBlock;
  rowActions: TranscriptRowActions;
}) {
  const liveStatus = liveRunStatusForBlock(block, rowActions);
  if (liveStatus === "approval") {
    return (
      <RunStatusRow
        mode="approval"
        runId={block.runId}
        tone="muted"
        icon={<CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />}
      >
        <span>Awaiting approval</span>
      </RunStatusRow>
    );
  }
  if (liveStatus === "working") {
    return <WorkingRunStatusRow block={block} />;
  }
  if (liveStatus === "reconnecting") {
    return (
      <RunStatusRow
        mode="reconnecting"
        runId={block.runId}
        tone="muted"
        icon={<RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />}
      >
        <span>{runLivenessPresentationLabel(liveStatus)}</span>
      </RunStatusRow>
    );
  }
  if (liveStatus === "lost") {
    return <LostRunStatusRow block={block} liveness={rowActions.activeRunLiveness} />;
  }
  return null;
}

type LiveRunStatusPresentation = RunLivenessPresentationKind | "approval" | null;

function liveRunStatusForBlock(
  block: TranscriptBlock,
  rowActions: TranscriptRowActions,
): LiveRunStatusPresentation {
  if (block.runId !== rowActions.activeRun?.id) {
    return null;
  }
  const presentation = activeRunPresentation(rowActions.activeRun, rowActions.activeRunLiveness);
  switch (presentation.kind) {
    case "blocked":
      return "approval";
    case "working":
      return "working";
    case "reconnecting":
      return "reconnecting";
    case "lost":
      return "lost";
    case "idle":
      return null;
    default:
      return assertNever(presentation.kind);
  }
}

function WorkingRunStatusRow({ block }: { block: TranscriptBlock }) {
  const label = block.runStatus?.label ?? "Working";
  return (
    <RunStatusRow
      mode="working"
      runId={block.runId}
      tone="muted"
      icon={<BrailleSpinner label={label} />}
    >
      <LiveHeadlineText active className="italic">
        {label}
      </LiveHeadlineText>
    </RunStatusRow>
  );
}

function LostRunStatusRow({
  block,
  liveness,
}: {
  block: TranscriptBlock;
  liveness: TranscriptRowActions["activeRunLiveness"];
}) {
  return (
    <RunStatusRow
      mode="lost"
      runId={block.runId}
      tone="error"
      icon={<WifiOff className="h-4 w-4 shrink-0 text-status-critical-muted" />}
    >
      <span>{runLivenessPresentationLabel("lost")}</span>
      {liveness && liveness.error !== "" ? (
        <span className="min-w-0 truncate text-status-critical">{liveness.error}</span>
      ) : null}
    </RunStatusRow>
  );
}

// background_terminal is a slim chronological marker that the assistant started or
// interacted with a background terminal at this point in the run. The terminal's
// live status and output are owned by the backend process registry (surfaced by the
// footer and monitor) and joined by processId; this block only records the
// chronological marker.
function BackgroundTerminalBlock({ block }: { block: TranscriptBlock }) {
  const terminal = block.backgroundTerminal;
  if (!terminal) {
    return null;
  }
  return (
    <div {...chatReadableColumnAttributes} className={chatReadableColumnPaddedClass}>
      <div
        className="flex h-6 min-w-0 items-center gap-2 text-xs text-muted-foreground"
        data-block-kind="background_terminal"
        data-process-id={terminal.processId}
        data-testid="background-terminal-block"
        data-transcript-block="true"
      >
        <SquareTerminal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0">{terminal.label}</span>
        {terminal.command !== "" ? (
          <span className="min-w-0 truncate font-mono text-foreground">{terminal.command}</span>
        ) : null}
      </div>
    </div>
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
    return <CircleAlert className="h-4 w-4 shrink-0 text-status-critical-muted" />;
  }
  if (status === "cancelled") {
    return <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <Check className="h-4 w-4 shrink-0 text-status-success-muted" />;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transcript render row: ${JSON.stringify(value)}`);
}
