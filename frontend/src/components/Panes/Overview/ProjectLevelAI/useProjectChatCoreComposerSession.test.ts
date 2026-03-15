import { describe, expect, it } from "vitest";

import {
  resolveProjectChatCoreDraftMessageAfterPendingPrompt,
  resolveProjectChatCoreExecutionSettingsForEngineType,
  resolveProjectChatCoreSettledChatId,
} from "./useProjectChatCoreComposerSession";

describe("useProjectChatCoreComposerSession helpers", () => {
  it("promotes minimal mode to config_toml_custom for external engines", () => {
    // External engines reuse the custom config mode instead of the setta-only minimal mode.
    expect(
      resolveProjectChatCoreExecutionSettingsForEngineType({
        current: {
          permissionMode: "minimal",
          searchEnabled: true,
        },
        isExternalEngine: true,
      }),
    ).toEqual({
      permissionMode: "config_toml_custom",
      searchEnabled: true,
    });
  });

  it("restores the default setta permission mode when leaving an external engine", () => {
    // Returning to a setta model must clear the external-only config_toml_custom state.
    expect(
      resolveProjectChatCoreExecutionSettingsForEngineType({
        current: {
          permissionMode: "config_toml_custom",
          searchEnabled: false,
        },
        isExternalEngine: false,
      }),
    ).toEqual({
      permissionMode: "minimal",
      searchEnabled: false,
    });
  });

  it("keeps unrelated permission modes unchanged", () => {
    // Stable modes should not churn when the engine family already matches the current mode.
    expect(
      resolveProjectChatCoreExecutionSettingsForEngineType({
        current: {
          permissionMode: "yolo",
          searchEnabled: true,
        },
        isExternalEngine: false,
      }),
    ).toBeNull();
  });

  it("settles onto the new chat id after a successful pending-thread submit", () => {
    // Successful first-submit promotion should move the coordinator onto the new persisted chat.
    expect(
      resolveProjectChatCoreSettledChatId({
        currentChatId: null,
        newChatId: "chat-next",
        succeeded: true,
      }),
    ).toBe("chat-next");
  });

  it("keeps the current chat id when pending-thread settlement fails", () => {
    // Failed settlement should leave the visible thread selection unchanged.
    expect(
      resolveProjectChatCoreSettledChatId({
        currentChatId: "chat-current",
        newChatId: null,
        succeeded: false,
      }),
    ).toBe("chat-current");
  });

  it("returns undefined when a failed pending-thread settle started from no chat", () => {
    // A failed brand-new draft thread should fall back to the pre-start undefined state.
    expect(
      resolveProjectChatCoreSettledChatId({
        currentChatId: null,
        newChatId: null,
        succeeded: false,
      }),
    ).toBeUndefined();
  });

  it("adopts the pending prompt when the draft is still blank", () => {
    // Pending prompts should only seed empty composer state.
    expect(
      resolveProjectChatCoreDraftMessageAfterPendingPrompt({
        currentDraftMessage: "   ",
        pendingPrompt: "Summarize the repo status",
      }),
    ).toBe("Summarize the repo status");
  });

  it("keeps an existing draft instead of overwriting it with a pending prompt", () => {
    // A user-authored draft must win over deferred prompt restoration.
    expect(
      resolveProjectChatCoreDraftMessageAfterPendingPrompt({
        currentDraftMessage: "Already typing something",
        pendingPrompt: "Summarize the repo status",
      }),
    ).toBeNull();
  });

  it("ignores missing pending prompts", () => {
    // There is nothing to restore when the pending prompt has already been cleared.
    expect(
      resolveProjectChatCoreDraftMessageAfterPendingPrompt({
        currentDraftMessage: "",
        pendingPrompt: null,
      }),
    ).toBeNull();
  });
});
