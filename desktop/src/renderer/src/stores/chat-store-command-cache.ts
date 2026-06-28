import type { ChatCommandDescriptor, Conversation } from "@generated/backend";

import type { ChatStore } from "./chat-store-types";

export function commandDescriptorCacheKey({
  activeRun,
  selectedConversation,
  workspaceId,
}: Pick<ChatStore, "activeRun" | "selectedConversation" | "workspaceId">) {
  return commandDescriptorContextKey({
    active: activeRun !== null,
    selectedConversation,
    workspaceId,
  });
}

export function commandDescriptorContextKey({
  active,
  selectedConversation,
  workspaceId,
}: {
  active: boolean;
  selectedConversation: Conversation | null;
  workspaceId: string | null;
}) {
  if (!workspaceId || !selectedConversation) {
    return "";
  }
  return [
    workspaceId,
    selectedConversation.id,
    active ? "active" : "idle",
    harnessRefCacheKey(selectedConversation.harnessRefs),
  ].join(":");
}

export function cacheableCommandDescriptors(commands: ChatCommandDescriptor[]) {
  return [...commands];
}

function harnessRefCacheKey(harnessRefs: Conversation["harnessRefs"]) {
  if (harnessRefs.length === 0) {
    return "no-harness";
  }
  return harnessRefs
    .map((ref) =>
      [
        ref.harness,
        ref.status,
        ref.threadId,
        ref.sessionId,
        ref.lastTurnId,
        ref.unavailableMessage,
      ].join(","),
    )
    .sort()
    .join("|");
}
