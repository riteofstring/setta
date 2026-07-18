import type { ChatCodexDefaultsView } from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { chatCodexSettingsEqual, useChatDefaultsStore } from "./chat-defaults-store";

describe("chat defaults store", () => {
  beforeEach(() => {
    useChatDefaultsStore.setState({
      draft: null,
      error: null,
      status: "idle",
      view: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("loads defaults into a draft", async () => {
    const readCodexDefaults = vi.fn().mockResolvedValue(testDefaultsView());
    installChatDefaultsAPI({ readCodexDefaults });

    await useChatDefaultsStore.getState().load();

    expect(readCodexDefaults).toHaveBeenCalledOnce();
    expect(useChatDefaultsStore.getState().status).toBe("ready");
    expect(useChatDefaultsStore.getState().draft).toEqual(testDefaultsView().settings);
  });

  test("canonicalizes permission presets from backend options", () => {
    useChatDefaultsStore.setState({
      draft: testDefaultsView().settings,
      status: "ready",
      view: testDefaultsView(),
    });

    useChatDefaultsStore.getState().setPermissionPreset("read-only");

    expect(useChatDefaultsStore.getState().draft?.permission).toEqual({
      approvalPolicy: "on-request",
      permissions: ":read-only",
      preset: "read-only",
    });
  });

  test("clears reasoning when the model default is selected", () => {
    useChatDefaultsStore.setState({
      draft: { ...testDefaultsView().settings, reasoningEffort: "high" },
      status: "ready",
      view: testDefaultsView(),
    });

    useChatDefaultsStore.getState().setModel("");

    expect(useChatDefaultsStore.getState().draft).toMatchObject({
      model: "",
      reasoningEffort: null,
    });
  });

  test("saves the current draft through the chat API", async () => {
    const next = {
      ...testDefaultsView(),
      settings: {
        ...testDefaultsView().settings,
        model: "scripted-careful",
      },
    };
    const updateCodexDefaults = vi.fn().mockResolvedValue(next);
    installChatDefaultsAPI({ updateCodexDefaults });
    useChatDefaultsStore.setState({
      draft: next.settings,
      status: "ready",
      view: testDefaultsView(),
    });

    await useChatDefaultsStore.getState().saveDraft();

    expect(updateCodexDefaults).toHaveBeenCalledWith({
      confirmed: false,
      settings: next.settings,
    });
    expect(useChatDefaultsStore.getState().status).toBe("ready");
    expect(useChatDefaultsStore.getState().view).toEqual(next);
  });

  test("passes explicit confirmation when saving a confirmed permission escalation", async () => {
    const updateCodexDefaults = vi.fn().mockResolvedValue(testDefaultsView());
    installChatDefaultsAPI({ updateCodexDefaults });
    useChatDefaultsStore.setState({
      draft: testDefaultsView().settings,
      status: "ready",
      view: testDefaultsView(),
    });

    await useChatDefaultsStore.getState().saveDraft({ confirmed: true });

    expect(updateCodexDefaults).toHaveBeenCalledWith({
      confirmed: true,
      settings: testDefaultsView().settings,
    });
  });

  test("compares defaults by value instead of object key order", () => {
    expect(
      chatCodexSettingsEqual(
        {
          model: "scripted-careful",
          permission: {
            approvalPolicy: "on-request",
            permissions: ":read-only",
            preset: "read-only",
          },
          reasoningEffort: "xhigh",
        },
        {
          model: "scripted-careful",
          reasoningEffort: "xhigh",
          permission: {
            preset: "read-only",
            approvalPolicy: "on-request",
            permissions: ":read-only",
          },
        },
      ),
    ).toBe(true);
  });
});

function installChatDefaultsAPI({
  readCodexDefaults = vi.fn(),
  updateCodexDefaults = vi.fn(),
}: {
  readCodexDefaults?: () => Promise<ChatCodexDefaultsView>;
  updateCodexDefaults?: (request: {
    confirmed: boolean;
    settings: ChatCodexDefaultsView["settings"];
  }) => Promise<ChatCodexDefaultsView>;
}) {
  vi.stubGlobal("window", {
    setta: {
      chat: {
        readCodexDefaults,
        updateCodexDefaults,
      },
    },
  });
}

function testDefaultsView(): ChatCodexDefaultsView {
  return {
    currentPermission: {
      activePermissionProfileExtends: "",
      activePermissionProfileId: ":workspace",
      approvalPolicy: "on-request",
      builtIn: true,
      displayLabel: "Ask for approval",
      preset: "default",
    },
    effectiveSettings: null,
    models: [
      {
        defaultReasoningEffort: "medium",
        description: "Fast scripted test model.",
        displayName: "Scripted Fast",
        hidden: false,
        id: "scripted-fast-catalog-id",
        isDefault: true,
        model: "scripted-fast",
        supportedReasoningEfforts: [
          {
            description: "Balances speed and reasoning depth.",
            displayName: "Medium",
            effort: "medium",
            isDefault: true,
          },
        ],
        supportsImages: true,
      },
      {
        defaultReasoningEffort: "medium",
        description: "Careful scripted test model.",
        displayName: "Scripted Careful",
        hidden: false,
        id: "scripted-careful",
        isDefault: false,
        model: "scripted-careful",
        supportedReasoningEfforts: [
          {
            description: "Greater reasoning depth.",
            displayName: "High",
            effort: "high",
            isDefault: false,
          },
        ],
        supportsImages: true,
      },
    ],
    permissionPresets: [
      {
        activePermissionProfileId: ":read-only",
        approvalPolicy: "on-request",
        danger: null,
        disabled: false,
        disabledReason: "",
        id: "read-only",
        label: "Read Only",
        shortDescription: "Read workspace files.",
      },
      {
        activePermissionProfileId: ":workspace",
        approvalPolicy: "on-request",
        danger: null,
        disabled: false,
        disabledReason: "",
        id: "default",
        label: "Ask for approval",
        shortDescription: "Edit workspace files and ask for broader access.",
      },
    ],
    reasoningEfforts: [
      {
        description: "Balances speed and reasoning depth.",
        displayName: "Medium",
        effort: "medium",
        isDefault: true,
      },
    ],
    selectedModel: "",
    selectedPermissionPreset: "default",
    selectedReasoningEffort: null,
    settings: {
      model: "",
      permission: {
        approvalPolicy: "on-request",
        permissions: ":workspace",
        preset: "default",
      },
      reasoningEffort: null,
    },
  };
}
