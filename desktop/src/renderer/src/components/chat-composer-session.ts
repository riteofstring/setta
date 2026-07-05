import type { ComposerViewModel } from "./chat-composer-contract";

export function composerSessionMaterializedDraft(
  previous: ComposerViewModel["session"],
  next: ComposerViewModel["session"],
) {
  if (previous === null || next === null) {
    return false;
  }
  const draftWorkspaceId = draftSessionWorkspaceId(previous.id);
  return draftWorkspaceId !== "" && draftWorkspaceId === next.workspaceId;
}

function draftSessionWorkspaceId(sessionId: string) {
  const prefix = "new-chat:";
  return sessionId.startsWith(prefix) ? sessionId.slice(prefix.length) : "";
}
