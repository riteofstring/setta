import {
  clickReasoningEffortByText,
  waitForModelPickerSummary,
} from "./chat-workflow-assertions.mjs";
import {
  clickButtonByAria,
  clickButtonContainingText,
  clickButtonContainingTextByRole,
  createChat,
  waitForBackendState,
  waitForCommandResult,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

export async function runChatDefaultsSettingsWorkflow(client, backend, workspaceId) {
  await openChatDefaultsSettings(client);
  await assertFullAccessDefaultsRequiresConfirmation(backend);
  await setSettingsSelectValue(client, "chat-default-model-select", "scripted-careful");
  await setSettingsSelectValue(client, "chat-default-reasoning-select", "xhigh");
  await clickSettingsPermissionPreset(client, "full-access");
  await waitForTexts(client, ["Use Full Access"]);
  await clickButtonContainingText(client, "Use Full Access");
  await saveChatDefaultsSettings(client);
  await waitForSavedChatDefaults(backend, {
    model: "scripted-careful",
    permissionPreset: "full-access",
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

  await clickButtonByAria(client, "Open model and reasoning picker");
  await clickReasoningEffortByText(waitForState, client, "Low");
  await waitForCommandResult(backend, workspaceId, firstConversationId, "Reasoning set: Low");
  await waitForModelPickerSummary(waitForState, client, "Scripted Careful", "Low");
  await selectComposerPermissionPreset(client, "Ask for approval");
  await waitForCommandResult(
    backend,
    workspaceId,
    firstConversationId,
    "Permission mode set: Ask for approval",
  );
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

async function assertFullAccessDefaultsRequiresConfirmation(backend) {
  const view = await backend.get("/chat/codex/defaults");
  const preset = view.permissionPresets.find((candidate) => candidate.id === "full-access");
  if (!preset) {
    throw new Error("Full Access defaults preset missing");
  }
  const response = await backend.request("POST", "/chat/codex/defaults", {
    confirmed: false,
    settings: {
      ...view.settings,
      permission: {
        approvalPolicy: preset.approvalPolicy,
        permissions: preset.activePermissionProfileId,
        preset: preset.id,
      },
    },
  });
  const body = await response.json();
  if (response.ok) {
    throw new Error("unconfirmed Full Access defaults update unexpectedly succeeded");
  }
  if (body?.error?.code !== "permission_change_requires_confirmation") {
    throw new Error(`unexpected Full Access defaults confirmation error: ${JSON.stringify(body)}`);
  }
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
  await waitForTexts(client, ["Read Only", "Ask for approval", "Full Access"]);
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

async function waitForConversationCodexDefaults(backend, workspaceId, conversationId, expected) {
  return waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (list) =>
      list.conversations.some((candidate) =>
        conversationMatchesCodexDefaults(candidate, conversationId, expected),
      ),
  );
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
