import { assertWorkspaceAccessPermissionContract } from "./chat-workflow-permission-assertions.mjs";
import {
  assertTextAbsent,
  clickButtonByAria,
  clickButtonContainingTextByRole,
  submitComposer,
  waitForBackendState,
  waitForCommandResult,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function assertCodexProtocolNewChatPermissionContract(
  backend,
  workspaceId,
  conversationId,
) {
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  const item = list.conversations.find((candidate) => candidate.conversation.id === conversationId);
  if (!item) {
    throw new Error(`created conversation ${conversationId} was not returned by list`);
  }
  const settings = item.conversation.codexEffectiveSettings;
  if (!settings || !Object.prototype.hasOwnProperty.call(settings, "permission")) {
    throw new Error(
      `created Codex conversation lacks effective permission: ${JSON.stringify(item)}`,
    );
  }
  assertWorkspaceAccessPermissionContract(settings.permission, "created Codex conversation");
}

export async function exerciseLinkedCodexPermissionPicker(
  client,
  backend,
  workspaceId,
  conversationId,
) {
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Workspace Access"]);
  await assertTextAbsent(client, "codexEffectiveSettings modelDisplayName is required");
  await clickButtonContainingTextByRole(client, "menuitemradio", "Read Only");
  await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Permission mode set: Read Only",
  );
  await waitForConversationEffectivePermission(backend, workspaceId, conversationId, "read-only");
  await submitComposer(client, "protocol read only resume workflow", "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "protocol read only resume workflow",
    null,
  );
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "completed");
  await waitForConversationEffectivePermission(backend, workspaceId, conversationId, "read-only");
  await assertTextAbsent(client, "codexEffectiveSettings modelDisplayName is required");
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Workspace Access"]);
  await clickButtonContainingTextByRole(client, "menuitemradio", "Workspace Access");
  await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Permission mode set: Workspace Access",
  );
  await waitForConversationEffectivePermission(backend, workspaceId, conversationId, "default");
  await assertTextAbsent(client, "codexEffectiveSettings modelDisplayName is required");
}

async function waitForConversationEffectivePermission(
  backend,
  workspaceId,
  conversationId,
  preset,
) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (list) => {
      const item = list.conversations.find(
        (candidate) => candidate.conversation.id === conversationId,
      );
      return item?.conversation.codexEffectiveSettings?.permission?.preset === preset;
    },
  );
}
