import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import { seedPendingChatDetails } from "state/actions/aiPendingChatMessageState";
import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreadGroupAssignments";
import type { ProjectChatAuxView } from "state/definitions";
import { type ChatAppGenerationDetails } from "state/utils/chatAppGenerationDetails";
import type { BaseChatMessageUnion } from "utils/generatedTypes";
import {
  resolveProjectChatEngineSwitchContinuationAfterContextChange,
  type ProjectChatEngineSwitchContinuation,
} from "./projectChatEngineSelection";
import type { ThreadGroup } from "./projectChatHistoryViewModel";

// Owns per-surface thread session state, pending draft continuity, and group selection.
export type DraftProjectThreadState =
  | { phase: "none" }
  | { phase: "idle" }
  | { phase: "pending_chat_id" }
  | { phase: "awaiting_title"; chatId: string };

type ProjectChatDraftThreadHint = {
  chatId: string | null;
  groupId: string | null;
} | null;

type ProjectChatHistoryEntryWithNameSource = {
  nameSource: string | null;
};

type UseProjectChatThreadSessionArgs = {
  activeConversationAppGenerationDetails: ChatAppGenerationDetails | null;
  activeConversationMessages: Array<BaseChatMessageUnion>;
  chatHistoryEntriesById: Map<string, ProjectChatHistoryEntryWithNameSource>;
  chatId: string | null | undefined;
  effectiveEngineId: string | null;
  projectConfigId: string;
  resolvedSurfaceId: string;
  setChatId: (next: SetStateAction<string | null | undefined>) => void;
  setProjectChatAuxView: (nextAuxView: ProjectChatAuxView) => void;
  setViewThreads: (next: SetStateAction<boolean>) => void;
  showInlineThreads: boolean;
  threadAssignments: Record<string, string | null | undefined>;
  threadGroups: Array<ThreadGroup>;
};

export function resolveProjectChatDraftThreadHint(args: {
  draftThreadState: DraftProjectThreadState;
  draftThreadTargetGroupId: string | null;
}): ProjectChatDraftThreadHint {
  if (args.draftThreadState.phase === "none") {
    return null;
  }
  if (args.draftThreadState.phase === "awaiting_title") {
    return {
      chatId: args.draftThreadState.chatId,
      groupId: args.draftThreadTargetGroupId,
    };
  }
  return {
    chatId: null,
    groupId: args.draftThreadTargetGroupId,
  };
}

export function resolveProjectChatDraftThreadStateAfterChatChange(args: {
  current: DraftProjectThreadState;
  chatHistoryEntriesById: Map<string, ProjectChatHistoryEntryWithNameSource>;
  chatId: string | null | undefined;
}): DraftProjectThreadState {
  const { current, chatHistoryEntriesById, chatId } = args;
  if (current.phase === "none") {
    return current;
  }
  if (current.phase === "idle") {
    if (typeof chatId === "string") {
      return { phase: "none" };
    }
    return current;
  }
  if (current.phase === "pending_chat_id") {
    if (typeof chatId === "string") {
      return { phase: "awaiting_title", chatId };
    }
    if (chatId === undefined) {
      return { phase: "idle" };
    }
    return current;
  }
  if (typeof chatId === "string" && chatId !== current.chatId) {
    return { phase: "none" };
  }
  const historyEntry = chatHistoryEntriesById.get(current.chatId);
  if (historyEntry && historyEntry.nameSource !== null) {
    return { phase: "none" };
  }
  return current;
}

export function useProjectChatThreadSession({
  activeConversationAppGenerationDetails,
  activeConversationMessages,
  chatHistoryEntriesById,
  chatId,
  effectiveEngineId,
  projectConfigId,
  resolvedSurfaceId,
  setChatId,
  setProjectChatAuxView,
  setViewThreads,
  showInlineThreads,
  threadAssignments,
  threadGroups,
}: UseProjectChatThreadSessionArgs) {
  const [draftThreadState, setDraftThreadState] =
    useState<DraftProjectThreadState>({
      phase: "none",
    });
  const [draftThreadTargetGroupId, setDraftThreadTargetGroupId] = useState<
    string | null
  >(null);
  const [selectedThreadGroupId, setSelectedThreadGroupId] = useState<
    string | null
  >(null);
  const [engineSwitchContinuation, setEngineSwitchContinuation] =
    useState<ProjectChatEngineSwitchContinuation | null>(null);
  const [
    draftThreadContinuationSourceChatId,
    setDraftThreadContinuationSourceChatId,
  ] = useState<string | null>(null);

  const draftThreadHint = useMemo(
    () =>
      resolveProjectChatDraftThreadHint({
        draftThreadState,
        draftThreadTargetGroupId,
      }),
    [draftThreadState, draftThreadTargetGroupId],
  );

  useEffect(() => {
    setDraftThreadState((current) =>
      resolveProjectChatDraftThreadStateAfterChatChange({
        current,
        chatHistoryEntriesById,
        chatId,
      }),
    );
  }, [chatHistoryEntriesById, chatId]);

  useEffect(() => {
    if (draftThreadState.phase !== "none") {
      return;
    }
    if (draftThreadTargetGroupId === null) {
      return;
    }
    setDraftThreadTargetGroupId(null);
  }, [draftThreadState.phase, draftThreadTargetGroupId]);

  useEffect(() => {
    if (typeof chatId !== "string" || chatId.trim() === "") {
      return;
    }
    setSelectedThreadGroupId(threadAssignments[chatId] ?? null);
  }, [chatId, threadAssignments]);

  useEffect(() => {
    setEngineSwitchContinuation((current) =>
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: current,
        chatId,
        selectedEngineId: effectiveEngineId,
      }),
    );
  }, [chatId, effectiveEngineId]);

  useEffect(() => {
    if (selectedThreadGroupId === null) {
      return;
    }
    const exists = threadGroups.some(
      (group) => group.id === selectedThreadGroupId,
    );
    if (!exists) {
      setSelectedThreadGroupId(null);
    }
  }, [selectedThreadGroupId, threadGroups]);

  useEffect(() => {
    if (
      draftThreadState.phase === "none" &&
      draftThreadContinuationSourceChatId !== null
    ) {
      setDraftThreadContinuationSourceChatId(null);
    }
  }, [draftThreadContinuationSourceChatId, draftThreadState.phase]);

  const clearThreadSession = useCallback(() => {
    setChatId(undefined);
    setDraftThreadState({ phase: "none" });
    setDraftThreadTargetGroupId(null);
    setSelectedThreadGroupId(null);
    setDraftThreadContinuationSourceChatId(null);
    setEngineSwitchContinuation(null);
  }, [setChatId]);

  const startNewChatDraft = useCallback(
    ({
      targetGroupId,
      clearContinuationSource,
    }: {
      targetGroupId: string | null;
      clearContinuationSource: boolean;
    }) => {
      setChatId(undefined);
      setDraftThreadState({ phase: "idle" });
      setDraftThreadTargetGroupId(targetGroupId);
      if (clearContinuationSource) {
        setDraftThreadContinuationSourceChatId(null);
      }
      setEngineSwitchContinuation(null);
      if (!showInlineThreads) {
        setViewThreads(false);
      }
      setProjectChatAuxView("none");
    },
    [setChatId, setProjectChatAuxView, setViewThreads, showInlineThreads],
  );

  const handleNewChatClick = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: true,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);

  const handleNewChatStartForSubmit = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: false,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);

  const handleNewChatInThreadGroup = useCallback(
    (groupId: string) => {
      startNewChatDraft({
        targetGroupId: groupId,
        clearContinuationSource: true,
      });
      setSelectedThreadGroupId(groupId);
    },
    [startNewChatDraft],
  );

  const handleContinueInNewThread = useCallback(() => {
    if (!engineSwitchContinuation) {
      return;
    }
    seedPendingChatDetails(
      activeConversationMessages,
      resolvedSurfaceId,
      activeConversationAppGenerationDetails,
    );
    setChatId(null);
    setDraftThreadState({ phase: "idle" });
    setDraftThreadTargetGroupId(selectedThreadGroupId);
    setDraftThreadContinuationSourceChatId(
      engineSwitchContinuation.sourceChatId,
    );
    setEngineSwitchContinuation(null);
    if (!showInlineThreads) {
      setViewThreads(false);
    }
    setProjectChatAuxView("none");
  }, [
    activeConversationAppGenerationDetails,
    activeConversationMessages,
    engineSwitchContinuation,
    resolvedSurfaceId,
    selectedThreadGroupId,
    setChatId,
    setProjectChatAuxView,
    setViewThreads,
    showInlineThreads,
  ]);

  const handleDraftThreadStart = useCallback(() => {
    setDraftThreadState((current) => {
      if (current.phase === "none") {
        return current;
      }
      return { phase: "pending_chat_id" };
    });
  }, []);

  const handleDraftThreadSettled = useCallback(
    (nextChatId: string | null, succeeded: boolean) => {
      if (succeeded && nextChatId && draftThreadTargetGroupId) {
        setProjectChatThreadGroupAssignment(
          projectConfigId,
          nextChatId,
          draftThreadTargetGroupId,
        );
      }
      if (succeeded && nextChatId) {
        setDraftThreadContinuationSourceChatId(null);
      }
      setDraftThreadState((current) => {
        if (current.phase === "none") {
          return current;
        }
        if (!succeeded || !nextChatId) {
          return { phase: "idle" };
        }
        return { phase: "awaiting_title", chatId: nextChatId };
      });
    },
    [draftThreadTargetGroupId, projectConfigId],
  );

  return {
    clearThreadSession,
    draftThreadContinuationSourceChatId,
    draftThreadHint,
    engineSwitchContinuation,
    handleContinueInNewThread,
    handleDraftThreadSettled,
    handleDraftThreadStart,
    handleNewChatClick,
    handleNewChatInThreadGroup,
    handleNewChatStartForSubmit,
    selectedThreadGroupId,
    setEngineSwitchContinuation,
    setSelectedThreadGroupId,
  };
}
