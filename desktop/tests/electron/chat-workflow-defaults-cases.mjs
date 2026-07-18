import {
  dispatchDocumentEscape,
  clickReasoningEffortByText,
  waitForModelPickerSummary,
} from "./chat-workflow-assertions.mjs";
import { pasteImageIntoComposer } from "./chat-workflow-image-attachment-cases.mjs";
import {
  clickButtonByAria,
  clickButtonContainingTextByRole,
  createChat,
  setInputValue,
  waitForBackendState,
  waitForCommandResult,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const preservedAttachmentFileName = "draft-preserved-picker.png";
const preservedAttachmentPNGBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAG0lEQVR4nGL6z8DA8J+BiZHh/38GBkAAAAD//x0hBAKGdL17AAAAAElFTkSuQmCC";

export async function assertNoConversationDraftDefaults(client, backend, workspaceId) {
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  if (list.conversations.length !== 0) {
    throw new Error(`expected fresh workspace with no conversations: ${JSON.stringify(list)}`);
  }
  await waitForModelPickerSummary(waitForState, client, "GPT Test", "Extra high");
  await waitForState(
    client,
    `(() => {
      const model = document.querySelector('button[aria-label="Open model and reasoning picker"]');
      const permission = document.querySelector('button[aria-label="Open permission mode picker"]');
      return {
        modelText: model?.innerText ?? "",
        permissionText: permission?.innerText ?? "",
      };
    })()`,
    (value) =>
      value.modelText.includes("GPT Test") &&
      value.modelText.includes("Extra high") &&
      !value.modelText.includes("Model\nReasoning") &&
      value.permissionText.includes("Workspace Access"),
  );
  await assertNoConversations(backend, workspaceId, "draft defaults label rendering");
  await clickButtonByAria(client, "Open model and reasoning picker");
  await waitForState(
    client,
    `document.querySelector('button[aria-label="Open model and reasoning picker"]')?.getAttribute("aria-expanded")`,
    (value) => value === "true",
  );
  await dispatchDocumentEscape(client);
  await assertNoConversations(backend, workspaceId, "opening and closing draft model picker");
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForState(
    client,
    `document.querySelector('button[aria-label="Open permission mode picker"]')?.getAttribute("aria-expanded")`,
    (value) => value === "true",
  );
  await dispatchDocumentEscape(client);
  await assertNoConversations(backend, workspaceId, "opening and closing draft permission picker");
}

export async function runChatDefaultsSettingsWorkflow(client, backend, workspaceId) {
  await openChatDefaultsSettings(client);
  await setSettingsSelectValue(client, "chat-default-model-select", "scripted-careful");
  await setSettingsSelectValue(client, "chat-default-reasoning-select", "xhigh");
  await clickSettingsPermissionPreset(client, "default");
  await saveChatDefaultsSettings(client);
  await waitForSavedChatDefaults(backend, {
    model: "scripted-careful",
    permissionPreset: "default",
    reasoningEffort: "xhigh",
  });
  await clickSettingsPermissionPreset(client, "read-only");
  await saveChatDefaultsSettings(client);
  await waitForSavedChatDefaults(backend, {
    model: "scripted-careful",
    permissionPreset: "read-only",
    reasoningEffort: "xhigh",
  });

  const firstConversationId = await createChat(client, backend, workspaceId);
  await waitForConversationCodexDefaults(backend, workspaceId, firstConversationId, {
    model: "scripted-careful",
    permissionPreset: "read-only",
    reasoningEffort: "xhigh",
  });
  await waitForModelPickerSummary(waitForState, client, "Scripted Careful", "Extra high");
  await waitForComposerPermissionLabel(client, "Read Only");

  const preservedDraft = "draft survives model and permission pickers";
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', preservedDraft);
  await pasteImageIntoComposer(
    client,
    waitForState,
    preservedAttachmentFileName,
    preservedAttachmentPNGBase64,
  );
  await waitForComposerAttachment(client, preservedAttachmentFileName);
  await clickButtonByAria(client, "Open model and reasoning picker");
  await waitForComposerDraft(client, preservedDraft);
  await waitForComposerAttachment(client, preservedAttachmentFileName);
  await clickReasoningEffortByText(waitForState, client, "Low");
  await waitForCommandResult(backend, workspaceId, firstConversationId, "Reasoning set: Low");
  await waitForComposerDraft(client, preservedDraft);
  await waitForComposerAttachment(client, preservedAttachmentFileName);
  await waitForModelPickerSummary(waitForState, client, "Scripted Careful", "Low");
  await selectComposerPermissionPreset(client, "Workspace Access");
  await waitForCommandResult(
    backend,
    workspaceId,
    firstConversationId,
    "Permission mode set: Workspace Access",
  );
  await waitForComposerDraft(client, preservedDraft);
  await waitForComposerAttachment(client, preservedAttachmentFileName);
  await waitForConversationCodexDefaults(backend, workspaceId, firstConversationId, {
    model: "scripted-careful",
    permissionPreset: "default",
    reasoningEffort: "low",
  });

  const secondConversationId = await createChat(client, backend, workspaceId);
  await waitForConversationCodexDefaults(backend, workspaceId, secondConversationId, {
    model: "scripted-careful",
    permissionPreset: "read-only",
    reasoningEffort: "xhigh",
  });
  await waitForModelPickerSummary(waitForState, client, "Scripted Careful", "Extra high");
  await waitForComposerPermissionLabel(client, "Read Only");
}

async function waitForSavedChatDefaults(backend, expected) {
  await waitForBackendState(
    async () => backend.get("/chat/codex/defaults"),
    (value) =>
      value.settings.model === expected.model &&
      value.settings.reasoningEffort === expected.reasoningEffort &&
      value.settings.permission?.preset === expected.permissionPreset,
  );
}

async function openChatDefaultsSettings(client) {
  await clickButtonByAria(client, "Open settings");
  await waitForState(
    client,
    `(() => {
      const tab = document.querySelector("#settings-subtab-chat-defaults");
      return { ready: tab instanceof HTMLButtonElement };
    })()`,
    (value) => value.ready,
  );
  await client.evaluate(`(() => {
    const tab = document.querySelector("#settings-subtab-chat-defaults");
    if (!(tab instanceof HTMLButtonElement)) {
      throw new Error("missing chat defaults settings tab");
    }
    tab.click();
  })()`);
  await waitForState(
    client,
    `(() => {
      const panel = document.querySelector('[data-testid="chat-defaults-settings"]');
      const model = panel?.querySelector('[data-testid="chat-default-model-select"]');
      return {
        ready:
          panel instanceof HTMLElement &&
          model instanceof HTMLSelectElement &&
          Array.from(model.options).some((option) => option.value === "scripted-careful"),
      };
    })()`,
    (value) => value.ready,
  );
}

async function setSettingsSelectValue(client, testId, value) {
  await waitForState(
    client,
    `(() => {
      const element = document.querySelector('[data-testid="${testId}"]');
      return {
        ready:
          element instanceof HTMLSelectElement &&
          Array.from(element.options).some((option) => option.value === ${JSON.stringify(value)}),
      };
    })()`,
    (state) => state.ready,
  );
  await client.evaluate(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error("missing settings select ${testId}");
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) {
      throw new Error("missing select value setter");
    }
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitForState(
    client,
    `(() => {
      const element = document.querySelector('[data-testid="${testId}"]');
      return element instanceof HTMLSelectElement ? element.value : null;
    })()`,
    (selected) => selected === value,
  );
}

async function clickSettingsPermissionPreset(client, preset) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('[data-permission-preset="${preset}"]');
      if (!(button instanceof HTMLButtonElement)) {
        return { clicked: false, reason: "missing" };
      }
      button.click();
      return { clicked: true };
    })()`,
    (value) => value.clicked,
  );
}

async function saveChatDefaultsSettings(client) {
  await waitForState(
    client,
    `(() => {
      const panel = document.querySelector('[data-testid="chat-defaults-settings"]');
      const button = Array.from(panel?.querySelectorAll("button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "Save" && !candidate.disabled,
      );
      if (!(button instanceof HTMLButtonElement)) {
        return { clicked: false };
      }
      button.click();
      return { clicked: true };
    })()`,
    (value) => value.clicked,
  );
  await waitForTexts(client, ["Chat defaults saved"]);
}

async function selectComposerPermissionPreset(client, label) {
  await clickButtonByAria(client, "Open permission mode picker");
  await waitForTexts(client, ["Read Only", "Workspace Access"]);
  await clickButtonContainingTextByRole(client, "menuitemradio", label);
}

async function waitForComposerPermissionLabel(client, label) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('button[aria-label="Open permission mode picker"]');
      return { disabled: button?.disabled ?? null, text: button?.innerText ?? "" };
    })()`,
    (value) => value.disabled === false && value.text.includes(label),
  );
}

async function waitForComposerDraft(client, expected) {
  await waitForState(
    client,
    `(() => {
      const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
      return textarea instanceof HTMLTextAreaElement ? textarea.value : null;
    })()`,
    (value) => value === expected,
  );
}

async function waitForComposerAttachment(client, fileName) {
  await waitForState(
    client,
    `Boolean(document.querySelector('[data-testid="chat-composer"] img[alt=${JSON.stringify(fileName)}]'))`,
    Boolean,
  );
}

async function waitForConversationCodexDefaults(backend, workspaceId, conversationId, expected) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (list) =>
      list.conversations.some((candidate) =>
        conversationMatchesCodexDefaults(candidate, conversationId, expected),
      ),
  );
}

async function assertNoConversations(backend, workspaceId, label) {
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  if (list.conversations.length !== 0) {
    throw new Error(`${label} materialized an empty conversation: ${JSON.stringify(list)}`);
  }
}

function conversationMatchesCodexDefaults(item, conversationId, expected) {
  if (item.conversation.id !== conversationId) {
    return false;
  }
  return (
    codexSettingsMatch(item.conversation.codexSettings, expected) &&
    codexSettingsMatch(item.conversation.codexEffectiveSettings, expected)
  );
}

function codexSettingsMatch(settings, expected) {
  return (
    settings?.model === expected.model &&
    settings?.reasoningEffort === expected.reasoningEffort &&
    settings?.permission?.preset === expected.permissionPreset
  );
}
