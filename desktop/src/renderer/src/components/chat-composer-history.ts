import type {
  ChatImageInput,
  ChatInput,
  ChatMessage,
  ComposerPromptHistoryEntry,
  ComposerPromptHistoryPage,
  ImageAttachment,
} from "@generated/backend";
import type { KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

import { chatInputsEqual } from "../lib/chat-input";

const promptHistoryPageLimit = 30;

export interface ComposerPromptHistoryDraft {
  attachments: ImageAttachment[];
  imageInputsByAttachmentId: Record<string, ChatImageInput | undefined>;
  text: string;
}

interface ComposerPromptHistoryControllerOptions {
  applyDraft: (draft: ComposerPromptHistoryDraft) => void;
  conversationId: string;
  enabled: boolean;
  listHistory:
    | ((beforeOrdinal: number, limit: number) => Promise<ComposerPromptHistoryPage | null>)
    | null;
  maxAttachments: number;
  setDiagnostic: (message: string | null) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

interface ComposerPromptHistoryState {
  browsing: ComposerPromptHistoryBrowsingState | null;
  conversationId: string;
  hasMoreOlder: boolean;
  localEntries: ComposerPromptHistoryEntry[];
  olderBeforeOrdinal: number;
  pendingRequestId: number;
  remoteEntries: ComposerPromptHistoryEntry[];
}

export interface ComposerPromptHistoryBrowsingState {
  appliedDraft: ComposerPromptHistoryDraft;
  cursor: number;
  preNavigationDraft: ComposerPromptHistoryDraft;
}

type PromptHistoryDirection = "newer" | "older";

interface HistoryEntryDraftResult {
  draft: ComposerPromptHistoryDraft | null;
  error: string | null;
}

export function useComposerPromptHistory({
  applyDraft,
  conversationId,
  enabled,
  listHistory,
  maxAttachments,
  setDiagnostic,
  textareaRef,
}: ComposerPromptHistoryControllerOptions) {
  const stateRef = useRef<ComposerPromptHistoryState>(initialPromptHistoryState(conversationId));

  useEffect(() => {
    stateRef.current = initialPromptHistoryState(conversationId);
    setDiagnostic(null);
  }, [conversationId, setDiagnostic]);

  const exitBrowsing = useCallback(() => {
    stateRef.current.browsing = null;
  }, []);

  const recordAcceptedSubmission = useCallback(
    (message: ChatMessage, input: ChatInput, attachments: ImageAttachment[]) => {
      if (!enabled) {
        return;
      }
      if (conversationId === "" || message.conversationId !== conversationId) {
        return;
      }
      const state = stateRef.current;
      const entry: ComposerPromptHistoryEntry = {
        attachments: historyAttachmentsForInput(input, attachments),
        conversationId,
        createdAt: message.createdAt,
        input,
        messageId: message.id,
        ordinal: message.ordinal,
      };
      const newest = state.localEntries[0];
      if (newest && chatInputsEqual(newest.input, entry.input)) {
        return;
      }
      state.localEntries = [
        entry,
        ...state.localEntries.filter((candidate) => candidate.messageId !== entry.messageId),
      ];
    },
    [conversationId, enabled],
  );

  const handleKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLTextAreaElement>,
      currentDraft: ComposerPromptHistoryDraft,
      navigationBlocked: boolean,
    ) => {
      if (!enabled || listHistory === null) {
        return false;
      }
      if (navigationBlocked || event.nativeEvent.isComposing || !isPromptHistoryKey(event.key)) {
        return false;
      }
      const direction: PromptHistoryDirection = event.key === "ArrowUp" ? "older" : "newer";
      if (
        !promptHistoryNavigationAllowed(
          direction,
          event.currentTarget,
          currentDraft,
          stateRef.current.browsing,
        )
      ) {
        return false;
      }
      event.preventDefault();
      void navigatePromptHistory(direction, currentDraft);
      return true;
    },
    [applyDraft, conversationId, enabled, listHistory, maxAttachments, setDiagnostic, textareaRef],
  );

  async function navigatePromptHistory(
    direction: PromptHistoryDirection,
    currentDraft: ComposerPromptHistoryDraft,
  ) {
    const state = stateRef.current;
    if (direction === "newer") {
      const browsing = state.browsing;
      if (browsing === null) {
        return;
      }
      const nextCursor = browsing.cursor - 1;
      if (nextCursor < 0) {
        state.browsing = null;
        setDiagnostic(null);
        applyPromptHistoryDraft(browsing.preNavigationDraft);
        return;
      }
      applyHistoryEntryAt(nextCursor, browsing.preNavigationDraft);
      return;
    }

    const nextCursor = state.browsing ? state.browsing.cursor + 1 : 0;
    const preNavigationDraft = state.browsing?.preNavigationDraft ?? currentDraft;
    if (!(await ensurePromptHistoryIndex(nextCursor))) {
      return;
    }
    applyHistoryEntryAt(nextCursor, preNavigationDraft);
  }

  async function ensurePromptHistoryIndex(index: number) {
    if (listHistory === null) {
      return false;
    }
    while (combinedPromptHistoryEntries(stateRef.current).length <= index) {
      const state = stateRef.current;
      if (!canRequestOlderPromptHistory(state, conversationId)) {
        return false;
      }
      const requestId = state.pendingRequestId + 1;
      state.pendingRequestId = requestId;
      const beforeOrdinal = state.remoteEntries.length === 0 ? 0 : state.olderBeforeOrdinal;
      const page = await listHistory(beforeOrdinal, promptHistoryPageLimit);
      if (
        stateRef.current.pendingRequestId !== requestId ||
        stateRef.current.conversationId !== conversationId
      ) {
        return false;
      }
      if (page === null) {
        return false;
      }
      stateRef.current.remoteEntries = mergePromptHistoryEntries(
        stateRef.current.remoteEntries,
        page.entries,
      );
      stateRef.current.hasMoreOlder = page.hasMoreOlder;
      stateRef.current.olderBeforeOrdinal = page.olderBeforeOrdinal;
      if (page.entries.length === 0) {
        return false;
      }
    }
    return true;
  }

  function applyHistoryEntryAt(index: number, preNavigationDraft: ComposerPromptHistoryDraft) {
    const entry = combinedPromptHistoryEntries(stateRef.current)[index];
    if (!entry) {
      return;
    }
    const result = draftFromPromptHistoryEntry(entry, maxAttachments);
    if (result.error !== null || result.draft === null) {
      setDiagnostic(result.error);
      return;
    }
    stateRef.current.browsing = {
      appliedDraft: result.draft,
      cursor: index,
      preNavigationDraft,
    };
    setDiagnostic(null);
    applyPromptHistoryDraft(result.draft);
  }

  function applyPromptHistoryDraft(draft: ComposerPromptHistoryDraft) {
    applyDraft(draft);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const cursor = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return {
    exitBrowsing,
    handleKeyDown,
    recordAcceptedSubmission,
  };
}

export function promptHistoryNavigationAllowed(
  direction: PromptHistoryDirection,
  textarea: HTMLTextAreaElement,
  currentDraft: ComposerPromptHistoryDraft,
  browsing: ComposerPromptHistoryBrowsingState | null,
) {
  if (!selectionCollapsed(textarea)) {
    return false;
  }
  if (browsing === null) {
    return direction === "older" && composerPromptDraftEmpty(currentDraft);
  }
  if (!composerPromptDraftsEqual(currentDraft, browsing.appliedDraft)) {
    return false;
  }
  if (direction === "newer") {
    return caretOnLastLine(textarea);
  }
  return caretOnFirstLine(textarea);
}

function canRequestOlderPromptHistory(state: ComposerPromptHistoryState, conversationId: string) {
  return state.hasMoreOlder && conversationId !== "";
}

export function draftFromPromptHistoryEntry(
  entry: ComposerPromptHistoryEntry,
  maxAttachments: number,
): HistoryEntryDraftResult {
  const text = entry.input.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text?.text ?? "")
    .join("");
  const attachmentsByID = new Map(
    entry.attachments.map((attachment) => [attachment.id, attachment]),
  );
  const attachments: ImageAttachment[] = [];
  const imageInputsByAttachmentId: Record<string, ChatImageInput | undefined> = {};
  for (const part of entry.input.parts) {
    if (part.type !== "image" || part.image === null) {
      continue;
    }
    const attachment = attachmentsByID.get(part.image.attachmentId);
    if (!attachment) {
      return {
        draft: null,
        error: `Prompt history image is unavailable: ${part.image.attachmentId}`,
      };
    }
    if (attachment.conversationId !== entry.conversationId) {
      return {
        draft: null,
        error: `Prompt history image belongs to a different conversation: ${attachment.fileName}`,
      };
    }
    attachments.push(attachment);
    imageInputsByAttachmentId[attachment.id] = {
      attachmentId: attachment.id,
      detail: part.image.detail,
    };
  }
  if (attachments.length > maxAttachments) {
    return {
      draft: null,
      error: `Prompt history entry has ${attachments.length} images; this composer supports ${maxAttachments}.`,
    };
  }
  return {
    draft: { attachments, imageInputsByAttachmentId, text },
    error: null,
  };
}

function initialPromptHistoryState(conversationId: string): ComposerPromptHistoryState {
  return {
    browsing: null,
    conversationId,
    hasMoreOlder: true,
    localEntries: [],
    olderBeforeOrdinal: 0,
    pendingRequestId: 0,
    remoteEntries: [],
  };
}

function isPromptHistoryKey(key: string) {
  return key === "ArrowDown" || key === "ArrowUp";
}

function combinedPromptHistoryEntries(state: ComposerPromptHistoryState) {
  const localMessageIDs = new Set(state.localEntries.map((entry) => entry.messageId));
  return [
    ...state.localEntries,
    ...state.remoteEntries.filter((entry) => !localMessageIDs.has(entry.messageId)),
  ];
}

function mergePromptHistoryEntries(
  existing: ComposerPromptHistoryEntry[],
  incoming: ComposerPromptHistoryEntry[],
) {
  const seen = new Set(existing.map((entry) => entry.messageId));
  const merged = [...existing];
  for (const entry of incoming) {
    if (seen.has(entry.messageId)) {
      continue;
    }
    merged.push(entry);
    seen.add(entry.messageId);
  }
  return merged;
}

function historyAttachmentsForInput(input: ChatInput, attachments: ImageAttachment[]) {
  const attachmentsByID = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const historyAttachments: ImageAttachment[] = [];
  const seen = new Set<string>();
  for (const part of input.parts) {
    if (part.type !== "image" || part.image === null || seen.has(part.image.attachmentId)) {
      continue;
    }
    const attachment = attachmentsByID.get(part.image.attachmentId);
    if (attachment) {
      historyAttachments.push(attachment);
      seen.add(attachment.id);
    }
  }
  return historyAttachments;
}

function composerPromptDraftEmpty(draft: ComposerPromptHistoryDraft) {
  return draft.text === "" && draft.attachments.length === 0;
}

function composerPromptDraftsEqual(
  left: ComposerPromptHistoryDraft,
  right: ComposerPromptHistoryDraft,
) {
  return (
    left.text === right.text &&
    left.attachments.map((attachment) => attachment.id).join("\n") ===
      right.attachments.map((attachment) => attachment.id).join("\n")
  );
}

function selectionCollapsed(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart === textarea.selectionEnd;
}

function caretOnFirstLine(textarea: HTMLTextAreaElement) {
  const firstLineEnd = textarea.value.indexOf("\n");
  return firstLineEnd === -1 || textarea.selectionStart <= firstLineEnd;
}

function caretOnLastLine(textarea: HTMLTextAreaElement) {
  const lastLineStart = textarea.value.lastIndexOf("\n") + 1;
  return textarea.selectionStart >= lastLineStart;
}
