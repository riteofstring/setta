import type { KeyboardEvent } from "react";
import { buildChatHistoryEntries } from "state/actions/chatHistory";

export type ProjectChatHistoryEntry = ReturnType<
  typeof buildChatHistoryEntries
>[number];

export const DRAFT_THREAD_ENTRY_ID = "__setta_project_chat_draft_thread__";
export const DRAFT_THREAD_LABEL = "New thread...";
const THREAD_DND_PREFIX = "project-chat-thread::";
const THREAD_GROUP_DND_PREFIX = "project-chat-thread-group::";
const THREAD_SECTION_DROP_TARGET_PREFIX = "project-chat-thread-section-drop::";
const THREAD_DROP_TARGET_PREFIX = "project-chat-thread-drop::";
export const GROUP_DRAG_RELEASE_THRESHOLD_PX = 4;

export type ThreadPinDomain = "pinned" | "unpinned";
export const PINNED_THREAD_DOMAIN: ThreadPinDomain = "pinned";
export const UNPINNED_THREAD_DOMAIN: ThreadPinDomain = "unpinned";

export type ThreadGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  pinned?: boolean;
};

export type ThreadGroupSection = ThreadGroup & {
  entries: Array<ProjectChatHistoryEntry>;
};

export type ThreadDropPlacement = "before" | "after";

export type ThreadDropTarget = {
  groupId: string | null;
  targetThreadId: string | null;
  placement: ThreadDropPlacement;
  pinDomain: ThreadPinDomain;
};

export function getProjectChatDeleteRecoveryTooltipContent(
  target: "thread" | "group",
): string {
  if (target === "group") {
    return "Delete this group and move its chats to Ungrouped. Use Undo Delete in the toolbar to undo.";
  }
  return "Remove this chat from history. Use Undo Delete in the toolbar to undo.";
}

export function isDraftThreadEntry(entry: ProjectChatHistoryEntry): boolean {
  return entry.chatId === DRAFT_THREAD_ENTRY_ID;
}

export function isThreadEntryActive(
  entry: ProjectChatHistoryEntry,
  chatId: string | null | undefined,
): boolean {
  if (isDraftThreadEntry(entry)) {
    return chatId === null || chatId === undefined;
  }
  return entry.chatId === chatId;
}

export function normalizeUniqueThreadIds(
  threadIds: Array<string>,
): Array<string> {
  const seen = new Set<string>();
  const normalized: Array<string> = [];
  for (const threadId of threadIds) {
    const nextId = threadId.trim();
    if (!nextId || seen.has(nextId)) {
      continue;
    }
    seen.add(nextId);
    normalized.push(nextId);
  }
  return normalized;
}

export function toThreadDndId(threadId: string): string {
  return `${THREAD_DND_PREFIX}${threadId}`;
}

export function getThreadIdFromDndId(dndId: string): string | null {
  if (!dndId.startsWith(THREAD_DND_PREFIX)) {
    return null;
  }
  const threadId = dndId.slice(THREAD_DND_PREFIX.length).trim();
  return threadId || null;
}

export function toThreadGroupDndId(groupId: string): string {
  return `${THREAD_GROUP_DND_PREFIX}${groupId}`;
}

export function getThreadGroupIdFromDndId(
  dndId: string,
  groupIdSet: Set<string>,
): string | null {
  if (!dndId.startsWith(THREAD_GROUP_DND_PREFIX)) {
    return null;
  }
  const groupId = dndId.slice(THREAD_GROUP_DND_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return null;
  }
  return groupId;
}

export function toThreadDropTargetId(
  groupId: string | null,
  pinDomain: ThreadPinDomain,
): string {
  const groupToken = groupId === null ? "ungrouped" : groupId;
  return `${THREAD_DROP_TARGET_PREFIX}${groupToken}::${pinDomain}`;
}

export function toThreadSectionDropTargetId(groupId: string): string {
  return `${THREAD_SECTION_DROP_TARGET_PREFIX}${groupId}`;
}

export function parseThreadDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): { groupId: string | null; pinDomain: ThreadPinDomain } | undefined {
  if (!dndId.startsWith(THREAD_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const rawPayload = dndId.slice(THREAD_DROP_TARGET_PREFIX.length).trim();
  if (!rawPayload) {
    return undefined;
  }
  const [groupToken, pinDomainToken] = rawPayload.split("::");
  const pinDomain = parseThreadPinDomain(pinDomainToken);
  if (!groupToken || !pinDomain) {
    return undefined;
  }
  if (groupToken === "ungrouped") {
    return { groupId: null, pinDomain };
  }
  if (!groupIdSet.has(groupToken)) {
    return undefined;
  }
  return { groupId: groupToken, pinDomain };
}

export function getGroupIdFromThreadSectionDropTargetId(
  dndId: string,
  groupIdSet: Set<string>,
): string | undefined {
  if (!dndId.startsWith(THREAD_SECTION_DROP_TARGET_PREFIX)) {
    return undefined;
  }
  const groupId = dndId.slice(THREAD_SECTION_DROP_TARGET_PREFIX.length).trim();
  if (!groupId || !groupIdSet.has(groupId)) {
    return undefined;
  }
  return groupId;
}

export function normalizeThreadGroupNameForEditing(
  name: string,
): string | null {
  const normalized = name.trim().replace(/\s+/g, " ");
  return normalized || null;
}

export function onThreadEntryKeyDown(
  event: KeyboardEvent<HTMLElement>,
  entry: ProjectChatHistoryEntry,
  onSelect: (entry: ProjectChatHistoryEntry) => void,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect(entry);
}

function parseThreadPinDomain(
  value: string | undefined,
): ThreadPinDomain | null {
  if (value === PINNED_THREAD_DOMAIN || value === UNPINNED_THREAD_DOMAIN) {
    return value;
  }
  return null;
}
