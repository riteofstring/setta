import type {
  ChatCommandExecuteResult,
  ChatCommandResult,
  Conversation,
  MessagePage,
} from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { beforeEach, expect, test, vi } from "vitest";

import { useChatStore } from "./chat-store";

beforeEach(() => {
  useChatStore.setState({
    error: null,
    selectedConversation: null,
    status: "idle",
    workspaceId: null,
  });
});

test("sets a codex permission preset through the preload API", async () => {
  const conversation = testConversation();
  const updatedConversation = testConversation({
    codexEffectiveSettings: {
      model: "gpt-test",
      modelDisplayName: "GPT Test",
      permission: {
        activePermissionProfileExtends: "",
        activePermissionProfileId: ":danger-full-access",
        approvalPolicy: "never",
        builtIn: true,
        displayLabel: "Full Access",
        preset: "full-access",
      },
      reasoningEffort: "high",
      reasoningEffortDisplayName: "High",
      supportsImages: true,
    },
    codexSettings: {
      model: "gpt-test",
      permission: {
        approvalPolicy: "never",
        permissions: ":danger-full-access",
        preset: "full-access",
      },
      reasoningEffort: "high",
    },
  });
  const setCodexPermissionPreset = vi
    .fn<SettaAPI["chat"]["setCodexPermissionPreset"]>()
    .mockResolvedValue(
      commandExecuteResult(
        updatedConversation,
        commandResult("permission", "display", "Permission set: Full Access", "permission_set"),
      ),
    );
  installPermissionAPI(setCodexPermissionPreset);
  useChatStore.setState({
    selectedConversation: conversation,
    status: "ready",
    workspaceId: "workspace_api",
  });

  await useChatStore.getState().setCodexPermissionPreset("full-access", true);

  expect(setCodexPermissionPreset).toHaveBeenCalledWith(
    "workspace_api",
    "conversation_api",
    "full-access",
    true,
  );
  expect(useChatStore.getState().selectedConversation?.codexSettings?.permission?.preset).toBe(
    "full-access",
  );
  expect(
    useChatStore.getState().selectedConversation?.codexEffectiveSettings?.permission?.displayLabel,
  ).toBe("Full Access");
});

function installPermissionAPI(
  setCodexPermissionPreset: SettaAPI["chat"]["setCodexPermissionPreset"],
) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setta: { chat: { setCodexPermissionPreset } } },
  });
}

function testConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    archivedAt: "",
    codexEffectiveSettings: null,
    codexSettings: null,
    createdAt: "2026-05-29T20:00:00Z",
    harnessRefs: [],
    id: "conversation_api",
    internal: false,
    schemaVersion: 1,
    title: "API chat",
    updatedAt: "2026-05-29T20:00:00Z",
    workflow: null,
    workspaceId: "workspace_api",
    ...overrides,
    easyRun: overrides.easyRun ?? null,
  };
}

function testPage(conversation: Conversation): MessagePage {
  return {
    blocks: [],
    conversation,
    goal: null,
    hasMoreOlder: false,
    messages: [],
    olderBeforeBlockOrdinal: 0,
    queue: { messages: [], runs: [] },
  };
}

function commandExecuteResult(
  conversation: Conversation,
  result: ChatCommandResult,
): ChatCommandExecuteResult {
  return {
    activeRun: null,
    activeRunLiveness: null,
    conversation,
    message: null,
    page: testPage(conversation),
    result,
  };
}

function commandResult(
  kind: ChatCommandResult["kind"],
  action: ChatCommandResult["action"],
  messageText: string,
  raw: string,
): ChatCommandResult {
  return {
    action,
    composerDraft: "",
    currentPermission: null,
    goal: null,
    kind,
    message: messageText,
    models: [],
    permissionPresets: [],
    raw,
    reasoningEfforts: [],
    selectedModel: "",
    selectedPermissionPreset: null,
    selectedReasoningEffort: null,
    title: "Permission",
  };
}
