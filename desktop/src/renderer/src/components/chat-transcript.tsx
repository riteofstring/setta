import type { ChatMessage, Run, RunItem, RunItemOutput, TranscriptTurn } from "@generated/backend";
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

import { Button } from "./ui/button";
import { ApprovalCard, type SubmitApproval } from "./chat-transcript-approvals";
import {
  chatReadableColumnAttributes,
  chatReadableColumnClass,
  chatReadableColumnPaddedClass,
} from "./chat-layout";
import {
  transcriptTimelineRows,
  type TranscriptTimelineSource,
  type TranscriptTimelineRow,
} from "./chat-transcript-timeline";
import { ChatSearchBar, useTranscriptSearch } from "./chat-transcript-search";
import { type TranscriptRowActions } from "./chat-transcript-row-actions";
import { AssistantMessageChunkRow, MessageRow, TranscriptTurnRow } from "./chat-transcript-rows";
import {
  stableTranscriptTimelineRows,
  timestampMessageIdsForTimeline,
  type StableTranscriptTimelineRowsState,
} from "./chat-transcript-render-helpers";
import { cn } from "../lib/utils";
import type { RunItemOutputPageState } from "../stores/chat-store";

export interface ChatTranscriptProps {
  activeRun: Run | null;
  editQueuedMessage: (messageId: string, prompt: string) => Promise<void>;
  editingQueuedMessageId: string | null;
  hasMoreOlder: boolean;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: (
    runId: string,
    runItemId: string,
    afterOrdinal?: number,
    limit?: number,
  ) => Promise<void>;
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  operation: string | null;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  removingQueuedMessageId: string | null;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  searchOpen?: boolean;
  sendSteeringImmediately: (prompt?: string) => Promise<void>;
  setSearchOpen?: (open: boolean) => void;
  submitApproval: SubmitApproval;
  transcript: TranscriptTurn[];
}

interface TranscriptIndexes {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  turns: TranscriptTurn[];
}

function transcriptIndexes(props: {
  messageIds: string[];
  messagesById: Record<string, ChatMessage>;
  runItemIdsByRunId: Record<string, string[]>;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputsById: Record<string, RunItemOutput>;
  runItemsById: Record<string, RunItem>;
  transcript: TranscriptTurn[];
}): TranscriptIndexes {
  return {
    messageIds: props.messageIds,
    messagesById: props.messagesById,
    runItemIdsByRunId: props.runItemIdsByRunId,
    runItemOutputIdsByRunItemId: props.runItemOutputIdsByRunItemId,
    runItemOutputsById: props.runItemOutputsById,
    runItemsById: props.runItemsById,
    turns: props.transcript,
  };
}

export function transcriptVirtualItemKey(
  timeline: ReadonlyArray<Pick<TranscriptTimelineRow, "key">>,
  index: number,
  item: Pick<TranscriptTimelineRow, "key"> | undefined,
) {
  return item?.key ?? timeline[index]?.key ?? `transcript-row:${index}`;
}

export function transcriptVirtualItem(
  timeline: readonly TranscriptTimelineRow[],
  index: number,
  item: TranscriptTimelineRow | undefined,
) {
  return item ?? timeline[index] ?? null;
}

export function ChatTranscript({
  activeRun,
  editQueuedMessage,
  editingQueuedMessageId,
  hasMoreOlder,
  loadOlder,
  loadRunItemOutput,
  messageIds,
  messagesById,
  operation,
  removeQueuedMessage,
  removingQueuedMessageId,
  runItemIdsByRunId,
  runItemOutputIdsByRunItemId,
  runItemOutputPagesByRunItemId,
  runItemOutputsById,
  runItemsById,
  searchOpen = false,
  sendSteeringImmediately,
  setSearchOpen = () => {},
  submitApproval,
  transcript: backendTranscript,
}: ChatTranscriptProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const pinnedScrollFrameRef = useRef<number | null>(null);
  const stableTimelineRef = useRef<StableTranscriptTimelineRowsState>({
    byKey: new Map(),
    result: [],
  });
  const scrollTopRef = useRef(0);
  const visibleStartIndexRef = useRef(0);
  const [pinned, setPinned] = useState(true);
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<{
    key: string;
    previousFirstKey: string | null;
    previousLength: number;
  } | null>(null);
  const transcript = useMemo(
    () =>
      transcriptIndexes({
        messageIds,
        messagesById,
        runItemIdsByRunId,
        runItemOutputIdsByRunItemId,
        runItemOutputsById,
        runItemsById,
        transcript: backendTranscript,
      }),
    [
      messageIds,
      messagesById,
      runItemIdsByRunId,
      runItemOutputIdsByRunItemId,
      runItemOutputsById,
      runItemsById,
      backendTranscript,
    ],
  );
  const timelineSource = useMemo(
    () =>
      ({
        messageIds,
        messagesById,
        turns: backendTranscript,
      }) satisfies TranscriptTimelineSource,
    [messageIds, messagesById, backendTranscript],
  );
  const timeline = useMemo(() => {
    const nextState = stableTranscriptTimelineRows(
      transcriptTimelineRows(timelineSource),
      stableTimelineRef.current,
    );
    stableTimelineRef.current = nextState;
    return nextState.result;
  }, [timelineSource]);
  const timestampMessageIds = useMemo(() => timestampMessageIdsForTimeline(timeline), [timeline]);
  const search = useTranscriptSearch({
    messagesById,
    messageIds,
    open: searchOpen,
    setOpen: setSearchOpen,
    timeline,
    virtuosoRef,
  });
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
    timeline.length,
    transcript.runItemIdsByRunId,
    transcript.runItemOutputIdsByRunItemId,
    runItemOutputPagesByRunItemId,
    transcript.runItemOutputsById,
    transcript.runItemsById,
  ]);

  useEffect(() => {
    if (!pendingScrollAnchor) {
      return;
    }
    const currentFirstKey = timeline[0]?.key ?? null;
    if (
      currentFirstKey === pendingScrollAnchor.previousFirstKey &&
      timeline.length <= pendingScrollAnchor.previousLength
    ) {
      return;
    }
    const index = timeline.findIndex((row) => row.key === pendingScrollAnchor.key);
    setPendingScrollAnchor(null);
    if (index === -1) {
      return;
    }
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ align: "start", index });
    });
  }, [pendingScrollAnchor, timeline, virtuosoRef]);

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
    const anchorKey = timeline[visibleStartIndexRef.current]?.key ?? timeline[0]?.key ?? null;
    const previousFirstKey = timeline[0]?.key ?? null;
    const previousLength = timeline.length;
    setPinned(false);
    await loadOlder();
    if (anchorKey) {
      setPendingScrollAnchor({ key: anchorKey, previousFirstKey, previousLength });
    }
  }, [loadOlder, timeline]);

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
    (index: number, item: TranscriptTimelineRow | undefined) => {
      const row = transcriptVirtualItem(timeline, index, item);
      if (!row) {
        return null;
      }
      if (row.kind === "message") {
        return (
          <MessageRow
            loadRunItemOutput={loadRunItemOutput}
            activeSearchMessageId={search.activeMessageId}
            message={row.message}
            rowActions={rowActions}
            showTimestamp={timestampMessageIds.has(row.message.id)}
            runItemIdsByRunId={transcript.runItemIdsByRunId}
            runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
            runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
            runItemOutputsById={transcript.runItemOutputsById}
            runItemsById={transcript.runItemsById}
          />
        );
      }
      if (row.kind === "turn-message") {
        return (
          <MessageRow
            loadRunItemOutput={loadRunItemOutput}
            activeSearchMessageId={search.activeMessageId}
            message={row.message}
            rowActions={rowActions}
            showTimestamp={timestampMessageIds.has(row.message.id)}
            runItemIdsByRunId={transcript.runItemIdsByRunId}
            runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
            runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
            runItemOutputsById={transcript.runItemOutputsById}
            runItemsById={transcript.runItemsById}
          />
        );
      }
      if (row.kind === "assistant-chunk") {
        return (
          <AssistantMessageChunkRow
            loadRunItemOutput={loadRunItemOutput}
            activeSearchMessageId={search.activeMessageId}
            chunk={row.chunk}
            message={row.message}
            rowActions={rowActions}
            showTimestamp={row.chunk.isLast && timestampMessageIds.has(row.message.id)}
            runItemIdsByRunId={transcript.runItemIdsByRunId}
            runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
            runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
            runItemOutputsById={transcript.runItemOutputsById}
            runItemsById={transcript.runItemsById}
          />
        );
      }
      return (
        <TranscriptTurnRow
          loadRunItemOutput={loadRunItemOutput}
          activeSearchMessageId={search.activeMessageId}
          runItemIdsByRunId={transcript.runItemIdsByRunId}
          runItemOutputIdsByRunItemId={transcript.runItemOutputIdsByRunItemId}
          runItemOutputPagesByRunItemId={runItemOutputPagesByRunItemId}
          runItemOutputsById={transcript.runItemOutputsById}
          runItemsById={transcript.runItemsById}
          turn={row.turn}
          rowActions={rowActions}
          timestampMessageIds={timestampMessageIds}
        />
      );
    },
    [
      loadRunItemOutput,
      runItemOutputPagesByRunItemId,
      rowActions,
      search.activeMessageId,
      timestampMessageIds,
      timeline,
      transcript.runItemIdsByRunId,
      transcript.runItemOutputIdsByRunItemId,
      transcript.runItemOutputsById,
      transcript.runItemsById,
    ],
  );

  if (timeline.length === 0) {
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
        data={timeline}
        data-testid="chat-transcript-scroller"
        computeItemKey={(index, item) => transcriptVirtualItemKey(timeline, index, item)}
        followOutput={false}
        increaseViewportBy={{ bottom: 800, top: 400 }}
        initialItemCount={Math.min(timeline.length, 30)}
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
