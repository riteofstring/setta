import type { ChatMessage, Run, RunItemOutput, TranscriptBlock } from "@generated/backend";
import { ArrowDown, ChevronUp } from "lucide-react";
import {
  type KeyboardEvent,
  type UIEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";
import { transcriptRenderRows, type TranscriptRenderRow } from "../lib/chat-transcript-render-rows";
import { Button } from "./ui/button";
import { ApprovalCard, type SubmitApproval } from "./chat-transcript-approvals";
import {
  chatReadableColumnAttributes,
  chatReadableColumnClass,
  chatReadableColumnPaddedClass,
} from "./chat-layout";
import { chatMessageText } from "./chat-message-text";
import { TranscriptRenderRowView, type TranscriptRowContext } from "./chat-transcript-block";
import { ChatSearchBar, useTranscriptSearch } from "./chat-transcript-search";
import type { LoadRunItemOutput } from "./chat-transcript-activity";
import type { TranscriptRowActions } from "./chat-transcript-row-actions";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  blocks: TranscriptBlock[];
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  editingQueuedMessageId: string | null;
  focusedSourceRunItemId?: string | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  messages: ChatMessage[];
  operation: string | null;
  queuedMessages: ChatMessage[];
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  searchOpen?: boolean;
  sendSteeringImmediately: (prompt?: string) => Promise<void>;
  setSearchOpen?: (open: boolean) => void;
  submitApproval: SubmitApproval;
}

export function transcriptVirtualItemKey(
  rows: ReadonlyArray<Pick<TranscriptRenderRow, "key">>,
  index: number,
  item: Pick<TranscriptRenderRow, "key"> | undefined,
) {
  return item?.key ?? rows[index]?.key ?? `transcript-row:${index}`;
}

function transcriptSearchIndex(rows: TranscriptRenderRow[]) {
  const entries: { id: string; text: string }[] = [];
  const rowIndexById = new Map<string, number>();
  for (const row of rows) {
    for (const entry of transcriptSearchEntries(row)) {
      entries.push(entry);
      rowIndexById.set(entry.id, row.index);
    }
  }
  return { entries, rowIndexById };
}

function transcriptSearchEntries(row: TranscriptRenderRow): { id: string; text: string }[] {
  switch (row.kind) {
    case "message":
    case "queued":
      return [{ id: row.message.id, text: chatMessageText(row.message) }];
    case "activity-group":
      return row.expanded
        ? []
        : row.members.flatMap((member) => transcriptActivitySearchEntry(member));
    case "activity-item":
      return transcriptActivitySearchEntry(row.block);
    case "block":
      return transcriptBlockSearchEntries(row.block);
  }
}

function transcriptBlockSearchEntries(block: TranscriptBlock): { id: string; text: string }[] {
  if (block.kind === "user_message" && block.userMessage) {
    return [{ id: block.userMessage.messageId, text: messagePartsText(block.userMessage.parts) }];
  }
  if (block.kind === "assistant_text" && block.assistantText) {
    return [{ id: block.id, text: block.assistantText.text }];
  }
  return [];
}

function transcriptActivitySearchEntry(block: TranscriptBlock): { id: string; text: string }[] {
  const activity = block.activity;
  if (block.kind !== "activity_item" || !activity) {
    return [];
  }
  const details = activity.details;
  return [
    {
      id: block.id,
      text: [
        activity.title,
        details.command,
        details.cwd,
        details.filePaths.join("\n"),
        details.summary,
        details.progress,
        details.result,
        details.error,
        details.noticeKind,
        details.noticeMessage,
        details.diffSummary,
        details.serverName,
        details.toolName,
        details.namespace,
        details.processId,
        details.requestId,
        details.reviewId,
        details.patchStatus,
      ]
        .filter((item) => item !== "")
        .join("\n"),
    },
  ];
}

function messagePartsText(parts: { text: string }[]) {
  return parts.map((part) => part.text).join("");
}

export function ChatTranscript({
  activeRun,
  blocks,
  editQueuedMessage,
  editingQueuedMessageId,
  focusedSourceRunItemId = null,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messages,
  operation,
  queuedMessages,
  removeQueuedMessage,
  removingQueuedMessageId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  searchOpen = false,
  sendSteeringImmediately,
  setSearchOpen = () => {},
  submitApproval,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const pinnedScrollFrameRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const visibleStartIndexRef = useRef(0);
  const [pinned, setPinned] = useState(true);
  const [expandedActivityBlockIds, setExpandedActivityBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedActivityGroupIds, setExpandedActivityGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<{
    key: string;
    previousFirstKey: string | null;
    previousLength: number;
  } | null>(null);

  const focusedActivitySourceRunItemIds = useMemo(
    () => (focusedSourceRunItemId ? new Set([focusedSourceRunItemId]) : undefined),
    [focusedSourceRunItemId],
  );
  const baseRows = useMemo(
    () =>
      transcriptRenderRows({
        blocks,
        expandedActivityGroupIds,
        forceExpandedActivitySourceRunItemIds: focusedActivitySourceRunItemIds,
        messages,
        queuedMessages,
      }),
    [blocks, expandedActivityGroupIds, focusedActivitySourceRunItemIds, messages, queuedMessages],
  );
  const baseSearchIndex = useMemo(() => transcriptSearchIndex(baseRows), [baseRows]);
  const search = useTranscriptSearch({
    entries: baseSearchIndex.entries,
    open: searchOpen,
    rowIndexById: baseSearchIndex.rowIndexById,
    setOpen: setSearchOpen,
    virtuosoRef,
  });
  const activityBlockIds = useMemo(
    () =>
      new Set(
        blocks
          .filter((block) => block.kind === "activity_item" && block.activity)
          .map((block) => block.id),
      ),
    [blocks],
  );
  const forceExpandedActivityBlockIds = useMemo(
    () =>
      search.activeSearchId && activityBlockIds.has(search.activeSearchId)
        ? new Set([search.activeSearchId])
        : undefined,
    [activityBlockIds, search.activeSearchId],
  );
  const rows = useMemo(
    () =>
      transcriptRenderRows({
        blocks,
        expandedActivityGroupIds,
        forceExpandedActivityBlockIds,
        forceExpandedActivitySourceRunItemIds: focusedActivitySourceRunItemIds,
        messages,
        queuedMessages,
      }),
    [
      blocks,
      expandedActivityGroupIds,
      focusedActivitySourceRunItemIds,
      forceExpandedActivityBlockIds,
      messages,
      queuedMessages,
    ],
  );
  const finalSearchIndex = useMemo(() => transcriptSearchIndex(rows), [rows]);

  useEffect(() => {
    if (!search.activeSearchId) {
      return;
    }
    const index = finalSearchIndex.rowIndexById.get(search.activeSearchId);
    if (index === undefined) {
      return;
    }
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ align: "center", index });
    });
  }, [finalSearchIndex.rowIndexById, search.activeSearchId, virtuosoRef]);

  const rowActions = useMemo(
    () =>
      ({
        activeRun,
        editQueuedMessage,
        editingQueuedMessageId,
        operation,
        removeQueuedMessage,
        removingQueuedMessageId,
        sendSteeringImmediately,
      }) satisfies TranscriptRowActions,
    [
      activeRun,
      editQueuedMessage,
      editingQueuedMessageId,
      operation,
      removeQueuedMessage,
      removingQueuedMessageId,
      sendSteeringImmediately,
    ],
  );

  const setActivityRowExpanded = useCallback((blockId: string, open: boolean) => {
    setExpandedActivityBlockIds((current) => withIdsExpanded(current, [blockId], open));
  }, []);
  const setActivityGroupExpanded = useCallback((groupId: string, open: boolean) => {
    setExpandedActivityGroupIds((current) => withIdsExpanded(current, [groupId], open));
  }, []);

  const context = useMemo<TranscriptRowContext>(
    () => ({
      activeSearchId: search.activeSearchId,
      expandedActivityBlockIds,
      expandedActivityGroupIds,
      focusedSourceRunItemId,
      loadRunItemOutput,
      outputIdsByRunItemId: runItemOutputIdsByRunItemId,
      outputPagesByRunItemId: runItemOutputPagesByRunItemId,
      outputsById: runItemOutputsById,
      rowActions,
      setActivityGroupExpanded,
      setActivityRowExpanded,
    }),
    [
      expandedActivityBlockIds,
      expandedActivityGroupIds,
      focusedSourceRunItemId,
      loadRunItemOutput,
      rowActions,
      runItemOutputIdsByRunItemId,
      runItemOutputPagesByRunItemId,
      runItemOutputsById,
      search.activeSearchId,
      setActivityGroupExpanded,
      setActivityRowExpanded,
    ],
  );

  const scrollToLatest = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
  }, []);

  const schedulePinnedScrollToLatest = useCallback(() => {
    if (pinnedScrollFrameRef.current !== null) {
      return;
    }
    pinnedScrollFrameRef.current = requestAnimationFrame(() => {
      pinnedScrollFrameRef.current = null;
      scrollToLatest();
    });
  }, [scrollToLatest]);

  useEffect(
    () => () => {
      if (pinnedScrollFrameRef.current !== null) {
        cancelAnimationFrame(pinnedScrollFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!pinned) {
      return;
    }
    schedulePinnedScrollToLatest();
  }, [
    activeRun?.id,
    pinned,
    schedulePinnedScrollToLatest,
    rows.length,
    runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId,
    runItemOutputsById,
  ]);

  useEffect(() => {
    if (!pendingScrollAnchor) {
      return;
    }
    const currentFirstKey = rows[0]?.key ?? null;
    if (
      currentFirstKey === pendingScrollAnchor.previousFirstKey &&
      rows.length <= pendingScrollAnchor.previousLength
    ) {
      return;
    }
    const index = rows.findIndex((row) => row.key === pendingScrollAnchor.key);
    setPendingScrollAnchor(null);
    if (index === -1) {
      return;
    }
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ align: "start", index });
    });
  }, [pendingScrollAnchor, rows, virtuosoRef]);

  function updatePinnedFromScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    if (distanceFromBottom <= 8) {
      setPinned(true);
    }
    scrollTopRef.current = scrollTop;
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    updatePinnedFromScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY < 0) {
      setPinned(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (["ArrowUp", "Home", "PageUp"].includes(event.key)) {
      setPinned(false);
    }
  }

  const loadOlderAndPreserveScroll = useCallback(async () => {
    const anchorKey = rows[visibleStartIndexRef.current]?.key ?? rows[0]?.key ?? null;
    const previousFirstKey = rows[0]?.key ?? null;
    const previousLength = rows.length;
    setPinned(false);
    await loadOlder();
    if (anchorKey) {
      setPendingScrollAnchor({ key: anchorKey, previousFirstKey, previousLength });
    }
  }, [loadOlder, rows]);

  const virtuosoComponents = useMemo(
    () => ({
      Footer: () => <TranscriptFooter activeRun={activeRun} submitApproval={submitApproval} />,
      Header: () => (
        <TranscriptHeader hasMoreOlder={hasMoreOlder} loadOlder={loadOlderAndPreserveScroll} />
      ),
    }),
    [activeRun, hasMoreOlder, loadOlderAndPreserveScroll, submitApproval],
  );

  const renderTranscriptItem = useCallback(
    (index: number, item: TranscriptRenderRow | undefined) => {
      const row = item ?? rows[index] ?? null;
      if (!row) {
        return null;
      }
      return <TranscriptRenderRowView context={context} row={row} />;
    },
    [context, rows],
  );

  if (rows.length === 0) {
    return <EmptyChatTranscript activeRun={activeRun} submitApproval={submitApproval} />;
  }

  return (
    <div
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      onKeyDownCapture={handleKeyDown}
      onScrollCapture={handleScroll}
      onWheelCapture={handleWheel}
    >
      <ChatSearchBar search={search} />
      <Virtuoso
        atBottomStateChange={(atBottom) => {
          if (atBottom) {
            setPinned(true);
          }
        }}
        className="workspace-chat-pane-surface h-full min-h-0 min-w-0 overflow-x-hidden pt-4 pb-2"
        components={virtuosoComponents}
        data={rows}
        data-testid="chat-transcript-scroller"
        computeItemKey={(index, item) => transcriptVirtualItemKey(rows, index, item)}
        followOutput={false}
        increaseViewportBy={{ bottom: 800, top: 400 }}
        initialItemCount={Math.min(rows.length, 30)}
        itemContent={renderTranscriptItem}
        overscan={200}
        rangeChanged={(range) => {
          visibleStartIndexRef.current = range.startIndex;
        }}
        ref={virtuosoRef}
      />
      <JumpToLatestButton pinned={pinned} setPinned={setPinned} virtuosoRef={virtuosoRef} />
    </div>
  );
}

function withIdsExpanded(current: Set<string>, blockIds: string[], open: boolean) {
  const next = new Set(current);
  for (const blockId of blockIds) {
    if (open) {
      next.add(blockId);
    } else {
      next.delete(blockId);
    }
  }
  return next;
}

function EmptyChatTranscript({
  activeRun,
  submitApproval,
}: {
  activeRun: Run | null;
  submitApproval: SubmitApproval;
}) {
  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <div
        className="workspace-chat-pane-surface h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-3 pt-4 pb-2"
        data-testid="chat-transcript-scroller"
      >
        <div
          {...chatReadableColumnAttributes}
          className={cn(chatReadableColumnClass, "py-16 text-center text-xs text-muted-foreground")}
          data-testid="empty-chat"
        >
          Start a conversation for this workspace.
        </div>
        <PendingApproval activeRun={activeRun} submitApproval={submitApproval} />
      </div>
    </div>
  );
}

type TranscriptHeaderProps = { hasMoreOlder: boolean; loadOlder: () => Promise<void> };

function TranscriptHeader({ hasMoreOlder, loadOlder }: TranscriptHeaderProps) {
  if (!hasMoreOlder) {
    return null;
  }
  return (
    <div
      {...chatReadableColumnAttributes}
      className={cn(chatReadableColumnPaddedClass, "mb-2 flex justify-center")}
      data-testid="chat-transcript-header"
    >
      <Button
        className="border-border bg-background text-foreground hover:bg-accent"
        onClick={() => void loadOlder()}
        variant="secondary"
      >
        <ChevronUp className="h-4 w-4" />
        Older
      </Button>
    </div>
  );
}

type TranscriptFooterProps = { activeRun: Run | null; submitApproval: SubmitApproval };

function TranscriptFooter({ activeRun, submitApproval }: TranscriptFooterProps) {
  if (!activeRun?.pendingApproval) {
    return null;
  }
  return (
    <div {...chatReadableColumnAttributes} className={cn(chatReadableColumnPaddedClass, "py-2")}>
      <PendingApproval activeRun={activeRun} submitApproval={submitApproval} />
    </div>
  );
}

function PendingApproval({
  activeRun,
  submitApproval,
}: {
  activeRun: Run | null;
  submitApproval: SubmitApproval;
}) {
  if (!activeRun?.pendingApproval) {
    return null;
  }
  return (
    <ApprovalCard
      approval={activeRun.pendingApproval}
      key={activeRun.pendingApproval.id}
      submitApproval={submitApproval}
    />
  );
}

function JumpToLatestButton({
  pinned,
  setPinned,
  virtuosoRef,
}: {
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  virtuosoRef: { current: VirtuosoHandle | null };
}) {
  if (pinned) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-4 flex justify-center">
      <div
        {...chatReadableColumnAttributes}
        className={cn(chatReadableColumnClass, "flex justify-end")}
      >
        <Button
          aria-label="Jump to latest"
          className="pointer-events-auto h-7 w-7 rounded-sm border-border bg-muted/95 px-0 text-foreground shadow-lg shadow-black/30 hover:bg-accent hover:text-foreground"
          onClick={() => {
            virtuosoRef.current?.scrollToIndex({ align: "end", index: "LAST" });
            setPinned(true);
          }}
          variant="secondary"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
