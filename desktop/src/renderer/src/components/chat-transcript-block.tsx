import type {
  RunActiveStatusKind,
  RunLiveness,
  RunItemOutput,
  TranscriptBlock,
  TranscriptBlockStatus,
} from "@generated/backend";
import { Ban, Check, CircleAlert, RefreshCw, SquareTerminal, WifiOff } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { activeRunPresentation, type ActiveRunPresentation } from "../lib/chat-run-liveness";
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

type LiveActiveRunPresentation = ActiveRunPresentation & { kind: RunActiveStatusKind };

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
    preserveActivityGroupAnchor(
      activityGroupHeaderAnchor(groupRowRef.current),
      row.group.id,
      context.detachTranscriptScroll,
      () => {
        context.setActivityGroupExpanded(row.group.id, open);
        context.setActivityRowsExpanded(
          members.map((member) => member.id),
          open,
        );
      },
    );
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
    preserveActivityGroupAnchor(
      activityGroupHeaderAnchor(groupRowRef.current),
      row.group.id,
      context.detachTranscriptScroll,
      () => {
        context.setActivityGroupExpanded(row.group.id, open);
        if (!open) {
          context.setActivityRowsExpanded(
            expandableMembers.map((member) => member.id),
            false,
          );
        }
      },
    );
  };
  return (
    <div
      {...chatReadableColumnAttributes}
      className={chatReadableColumnPaddedClass}
      data-activity-group-id={row.group.id}
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
  groupId: string,
  detachTranscriptScroll: () => void,
  update: () => void,
) {
  detachTranscriptScroll();
  if (anchor === null) {
    update();
    return;
  }
  const root =
    anchor.closest<HTMLElement>('[data-testid="chat-transcript-scroll-follow"]') ?? document.body;
  const scroller = nearestActivityGroupScrollContainer(anchor);
  const top = anchor.getBoundingClientRect().top;
  flushSync(update);
  let remainingCorrections = 120;
  const correctAnchor = () => {
    const currentAnchor = currentActivityGroupAnchor(root, anchor, groupId);
    const currentScroller =
      scroller ?? (currentAnchor ? nearestActivityGroupScrollContainer(currentAnchor) : null);
    if (
      currentScroller === null ||
      !currentScroller.isConnected ||
      currentAnchor === null ||
      !currentAnchor.isConnected
    ) {
      remainingCorrections -= 1;
      return remainingCorrections > 0;
    }
    const delta = currentAnchor.getBoundingClientRect().top - top;
    if (Math.abs(delta) > 0.5) {
      currentScroller.scrollTop += delta;
    }
    remainingCorrections -= 1;
    return remainingCorrections > 0;
  };
  correctAnchor();
  const interval = window.setInterval(() => {
    if (!correctAnchor()) {
      window.clearInterval(interval);
    }
  }, 8);
}

function activityGroupHeaderAnchor(groupRow: HTMLElement | null) {
  return (
    groupRow?.querySelector<HTMLElement>('[data-testid="activity-group-header"]')?.parentElement ??
    groupRow
  );
}

function currentActivityGroupAnchor(root: HTMLElement, anchor: HTMLElement, groupId: string) {
  if (anchor.isConnected) {
    return anchor;
  }
  const groupRow = root.querySelector<HTMLElement>(
    `[data-activity-group-id="${cssAttributeValue(groupId)}"]`,
  );
  return activityGroupHeaderAnchor(groupRow);
}

function nearestActivityGroupScrollContainer(anchor: HTMLElement) {
  let current = anchor.parentElement;
  while (current !== null) {
    const style = window.getComputedStyle(current);
    if (
      current.scrollHeight > current.clientHeight &&
      (style.overflowY === "auto" || style.overflowY === "scroll")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function cssAttributeValue(value: string) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
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

// run_status carries the live active-run indicator (never persisted) and the
// permanent terminal modes. Terminal modes render a slim fixed-height status row
// that matches block heights so reload keeps the layout.
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
  const presentation = liveRunStatusForBlock(block, rowActions);
  if (presentation === null) {
    return null;
  }
  const detail = presentation.detail || presentation.liveness?.error || "";
  return (
    <RunStatusRow
      mode={presentation.kind}
      runId={block.runId}
      tone={presentation.kind === "connection_lost" ? "error" : "muted"}
      icon={liveRunStatusIcon(presentation)}
    >
      <LiveHeadlineText active className={liveRunStatusHeadlineClass(presentation.kind)}>
        {presentation.headline}
      </LiveHeadlineText>
      {detail !== "" ? (
        <span
          className={cn(
            "min-w-0 truncate",
            presentation.kind === "connection_lost" ? "text-status-critical" : "",
          )}
        >
          {detail}
        </span>
      ) : null}
    </RunStatusRow>
  );
}

function liveRunStatusForBlock(
  block: TranscriptBlock,
  rowActions: TranscriptRowActions,
): LiveActiveRunPresentation | null {
  if (block.runId !== rowActions.activeRun?.id) {
    return null;
  }
  const presentation = activeRunPresentation(rowActions.activeRun, rowActions.activeRunLiveness);
  if (presentation.kind === "idle") {
    return null;
  }
  return presentation as LiveActiveRunPresentation;
}

function liveRunStatusIcon(presentation: LiveActiveRunPresentation) {
  return liveRunStatusIconByKind[presentation.kind](presentation);
}

function liveRunStatusHeadlineClass(kind: RunActiveStatusKind) {
  return liveRunStatusHeadlineClassByKind[kind];
}

const liveRunStatusIconByKind = {
  blocked: () => <CircleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />,
  connection_lost: () => <WifiOff className="h-4 w-4 shrink-0 text-status-critical-muted" />,
  finished: () => <Check className="h-4 w-4 shrink-0 text-muted-foreground" />,
  reconnecting: () => <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />,
  stalled: () => <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />,
  starting: (presentation) => <BrailleSpinner label={presentation.headline} />,
  thinking: (presentation) => <BrailleSpinner label={presentation.headline} />,
  waiting: (presentation) => <BrailleSpinner label={presentation.headline} />,
  waiting_for_provider: (presentation) => <BrailleSpinner label={presentation.headline} />,
  working: (presentation) => <BrailleSpinner label={presentation.headline} />,
} satisfies Record<RunActiveStatusKind, (presentation: LiveActiveRunPresentation) => ReactNode>;

const liveRunStatusHeadlineClassByKind = {
  blocked: "",
  connection_lost: "",
  finished: "",
  reconnecting: "",
  stalled: "",
  starting: "",
  thinking: "italic",
  waiting: "",
  waiting_for_provider: "",
  working: "italic",
} satisfies Record<RunActiveStatusKind, string>;

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
