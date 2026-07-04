import type {
  BackgroundTerminalListProjection,
  Conversation,
  MessagePage,
  Run,
  RunLiveness,
} from "@generated/backend";

interface ConversationPageSnapshot {
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  backgroundTerminals: BackgroundTerminalListProjection;
  page: MessagePage;
}

export async function loadConversationPageSnapshot({
  assertBackendReadCurrent,
  conversation,
  generation,
  pageLimit,
  workspaceId,
}: {
  assertBackendReadCurrent: (generation: number) => void;
  conversation: Conversation;
  generation: number;
  pageLimit: number;
  workspaceId: string;
}): Promise<ConversationPageSnapshot> {
  assertBackendReadCurrent(generation);
  const page = await window.setta.chat.messagePage(workspaceId, conversation.id, 0, pageLimit);
  assertBackendReadCurrent(generation);
  const active = await window.setta.chat.activeRun(workspaceId, conversation.id);
  assertBackendReadCurrent(generation);
  const backgroundTerminals = await window.setta.chat.listBackgroundTerminals(
    workspaceId,
    conversation.id,
  );
  assertBackendReadCurrent(generation);
  return {
    activeRun: active.hasActiveRun ? active.run : null,
    activeRunLiveness: active.hasActiveRun ? active.liveness : null,
    backgroundTerminals,
    page,
  };
}
