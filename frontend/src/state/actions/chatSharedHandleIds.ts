export const SHARED_CHAT_EDGE_HANDLE_IDS = {
  source: "chat-shared-edge-source",
  target: "chat-shared-edge-target",
  reverseStart: "chat-shared-edge-reverse-start",
} as const;

export type ChatSharedEdgeMode = "agentic" | "workflow";
type EdgeHandleFamily = "agentic" | "workflow" | "shared" | "other";

export function isSharedChatHandleId(
  handleId: string | null | undefined,
): boolean {
  return (
    handleId === SHARED_CHAT_EDGE_HANDLE_IDS.source ||
    handleId === SHARED_CHAT_EDGE_HANDLE_IDS.target ||
    handleId === SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart
  );
}

function getEdgeHandleFamily(
  handleId: string | null | undefined,
): EdgeHandleFamily {
  if (!handleId) {
    return "other";
  }
  if (handleId.startsWith("agentic-edge-")) {
    return "agentic";
  }
  if (isSharedChatHandleId(handleId)) {
    return "shared";
  }
  if (
    handleId === "workflow-source" ||
    handleId === "workflow-target" ||
    handleId === "workflow-reverse-start"
  ) {
    return "workflow";
  }
  return "other";
}

export function canConnectHandleFamilies(
  startHandleId: string | null | undefined,
  endHandleId: string | null | undefined,
): boolean {
  const startFamily = getEdgeHandleFamily(startHandleId);
  const endFamily = getEdgeHandleFamily(endHandleId);
  if (startFamily === "agentic") {
    return endFamily === "agentic" || endFamily === "shared";
  }
  if (startFamily === "workflow") {
    return endFamily === "workflow" || endFamily === "shared";
  }
  if (startFamily === "shared") {
    return (
      endFamily === "agentic" ||
      endFamily === "workflow" ||
      endFamily === "shared"
    );
  }
  return endFamily === "other";
}
