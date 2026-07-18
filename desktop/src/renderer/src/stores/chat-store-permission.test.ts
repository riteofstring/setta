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
        activePermissionProfileId: ":read-only",
        approvalPolicy: "never",
        builtIn: true,
        displayLabel: "Read Only",
        preset: "read-only",
      },
      reasoningEffort: "high",
      reasoningEffortDisplayName: "High",
      supportsImages: true,
    },
    codexSettings: {
      model: "gpt-test",
      permission: {
        approvalPolicy: "never",
        permissions: ":read-only",
        preset: "read-only",
      },
      reasoningEffort: "high",
    },
  });
  const setCodexPermissionPreset = vi
    .fn<SettaAPI["chat"]["setCodexPermissionPreset"]>()
    .mockResolvedValue(
      commandExecuteResult(
        updatedConversation,
        commandResult("permission", "display", "Permission set: Read Only", "permission_set"),
      ),
    );
  installPermissionAPI(setCodexPermissionPreset);
  useChatStore.setState({
    selectedConversation: conversation,
    status: "ready",
    workspaceId: "workspace_api",
  });

  await useChatStore.getState().setCodexPermissionPreset("read-only", false);

  expect(setCodexPermissionPreset).toHaveBeenCalledWith(
    "workspace_api",
    "conversation_api",
    "read-only",
    false,
  );
  expect(useChatStore.getState().selectedConversation?.codexSettings?.permission?.preset).toBe(
    "read-only",
  );
  expect(
    useChatStore.getState().selectedConversation?.codexEffectiveSettings?.permission?.displayLabel,
  ).toBe("Read Only");
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
