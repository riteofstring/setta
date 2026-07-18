import { assertNoCriticalDiagnostics } from "./chat-workflow-assertions.mjs";
import {
  assertNoLinkedCodexRef,
  clickButtonByAria,
  clickButtonContainingText,
  clickButtonContainingTextByRole,
  createChat,
  submitComposer,
  waitForBackendState,
  waitForCommandResult,
  waitForLinkedCodexRef,
  waitForRunStatus,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runPermissionModeWorkflow(client, backend, workspaceId, conversationId) {
  let activeConversationId = conversationId;
  activeConversationId = await assertPermissionPickerClearsAfterConversationSwitch(
    client,
    backend,
    workspaceId,
    activeConversationId,
  );

  await assertNoLinkedCodexRef(backend, workspaceId, activeConversationId);
  await waitForPermissionButtonLabel(client, "Ask for approval");

  await selectPermissionPreset(client, "Read Only");
  await waitForCommandResult(
    backend,
    workspaceId,
    activeConversationId,
    "Permission mode set: Read Only",
  );
  await waitForConversationPermission(backend, workspaceId, activeConversationId, "read-only");
  await waitForPermissionButtonLabel(client, "Read Only");
  await assertNoLinkedCodexRef(backend, workspaceId, activeConversationId);

  await selectPermissionPreset(client, "Full Access");
  await waitForTexts(client, ["Use Full Access"]);
  await clickButtonContainingText(client, "Use Full Access");
  await waitForCommandResult(
    backend,
    workspaceId,
    activeConversationId,
    "Permission mode set: Full Access",
  );
  await waitForConversationPermission(backend, workspaceId, activeConversationId, "full-access");
  await waitForPermissionButtonLabel(client, "Full Access");
  await assertNoLinkedCodexRef(backend, workspaceId, activeConversationId);

  await reloadPermissionWorkflowRenderer(client);
  await waitForTexts(client, ["Full Access"]);
  await waitForPermissionButtonLabel(client, "Full Access");

  await submitComposer(client, "workflow hold for queue and steering", "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    activeConversationId,
    "workflow hold for queue and steering",
    "running",
  );
  await waitForPermissionPickerDisabledForRun(client);
  await submitComposer(client, "finish permission mode workflow", "Send steering message");
  await waitForRunStatus(backend, workspaceId, activeConversationId, activeRun.id, "completed");
  await waitForLinkedCodexRef(backend, workspaceId, activeConversationId);
  await waitForTexts(client, ["Active workflow complete."]);

  await selectPermissionPreset(client, "Ask for approval");
  await waitForCommandResult(
    backend,
    workspaceId,
    activeConversationId,
    "Permission mode set: Ask for approval",
  );
  await waitForConversationEffectivePermission(
    backend,
    workspaceId,
    activeConversationId,
    "default",
  );
  await waitForPermissionButtonLabel(client, "Ask for approval");
  await assertNoCriticalDiagnostics(backend, workspaceId, activeConversationId);
}

async function assertPermissionPickerClearsAfterConversationSwitch(
  client,
  backend,
  workspaceId,
  conversationId,
) {
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Ask for approval", "Full Access"]);
  const nextConversationId = await createChat(client, backend, workspaceId);
  await waitForPermissionPickerClosed(client);
  await waitForConversationEffectivePermission(backend, workspaceId, conversationId, "default");
  return nextConversationId;
}

async function selectPermissionPreset(client, label) {
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Ask for approval", "Full Access"]);
  await clickButtonContainingTextByRole(client, "menuitemradio", label);
}

async function waitForPermissionButtonLabel(client, label) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('button[aria-label="Open permission mode picker"]');
      return { disabled: button?.disabled ?? null, text: button?.innerText ?? "" };
    })()`,
    (value) => value.disabled === false && value.text.includes(label),
  );
}

async function waitForPermissionPickerDisabledForRun(client) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('button[aria-label="Open permission mode picker"]');
      return { disabled: button?.disabled ?? null, title: button?.title ?? "" };
    })()`,
    (value) =>
      value.disabled === true &&
      value.title.includes("Permission changes apply after the current run finishes."),
  );
}

async function waitForPermissionPickerClosed(client) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('button[aria-label="Open permission mode picker"]');
      return button?.getAttribute("aria-expanded") ?? null;
    })()`,
    (value) => value === "false",
  );
}

async function waitForConversationPermission(backend, workspaceId, conversationId, preset) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (list) => {
      const item = list.conversations.find(
        (candidate) => candidate.conversation.id === conversationId,
      );
      return (
        item?.conversation.codexSettings?.permission?.preset === preset &&
        item?.conversation.codexEffectiveSettings?.permission?.preset === preset
      );
    },
  );
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

async function reloadPermissionWorkflowRenderer(client) {
  const marker = `permission-reload-${Date.now()}`;
  await client.evaluate(
    `(() => { window.__settaPermissionWorkflowReloadMarker = ${JSON.stringify(marker)}; })()`,
  );
  await client.call("Page.enable");
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Uncaught")) {
      throw error;
    }
  }
  await waitForState(
    client,
    `(() => ({
      marker: window.__settaPermissionWorkflowReloadMarker ?? "",
      readyState: document.readyState,
    }))()`,
    (value) =>
      value.marker !== marker &&
      (value.readyState === "interactive" || value.readyState === "complete"),
  );
}
