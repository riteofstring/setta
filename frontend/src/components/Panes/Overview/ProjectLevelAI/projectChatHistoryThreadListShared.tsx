import { useDroppable } from "forks/dnd-kit/adapter";
import { type ReactNode } from "react";
import {
  DRAFT_THREAD_ENTRY_ID,
  type ThreadPinDomain,
  toThreadDropTargetId,
} from "./projectChatHistoryDragUtils";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryViewModel";

export function isDraftProjectChatHistoryEntry(
  entry: ProjectChatHistoryEntry,
): boolean {
  return entry.chatId === DRAFT_THREAD_ENTRY_ID;
}

export function isProjectChatHistoryEntryActive(
  entry: ProjectChatHistoryEntry,
  chatId: string | null | undefined,
): boolean {
  if (isDraftProjectChatHistoryEntry(entry)) {
    return chatId === null || chatId === undefined;
  }
  return entry.chatId === chatId;
}

export function ProjectChatHistoryThreadDropZone({
  groupId,
  pinDomain,
  children,
}: {
  groupId: string | null;
  pinDomain: ThreadPinDomain;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: toThreadDropTargetId(groupId, pinDomain),
    data: {
      type: "project-chat-thread-drop-target",
      groupId,
      pinDomain,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col ${isOver ? "rounded border border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
      data-testid={
        groupId
          ? "project-chat-thread-group-drop-zone"
          : "project-chat-ungrouped-drop-zone"
      }
      data-thread-pin-domain={pinDomain}
      data-drop-highlight={isOver ? "true" : "false"}
    >
      {children}
    </div>
  );
}
