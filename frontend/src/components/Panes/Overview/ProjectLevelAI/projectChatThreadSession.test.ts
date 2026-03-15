import { describe, expect, it } from "vitest";

import {
  resolveProjectChatDraftThreadHint,
  resolveProjectChatDraftThreadStateAfterChatChange,
  type DraftProjectThreadState,
} from "./projectChatThreadSession";

describe("resolveProjectChatDraftThreadHint", () => {
  it("returns null when no draft thread is active", () => {
    // The history surface should stay clean when the composer is not in draft-thread mode.
    const hint = resolveProjectChatDraftThreadHint({
      draftThreadState: { phase: "none" },
      draftThreadTargetGroupId: "group-a",
    });

    expect(hint).toBeNull();
  });

  it("keeps the pending chat id and target group once a draft is awaiting a title", () => {
    // History rows need the concrete chat id after the draft thread has been created.
    const hint = resolveProjectChatDraftThreadHint({
      draftThreadState: { phase: "awaiting_title", chatId: "chat-1" },
      draftThreadTargetGroupId: "group-a",
    });

    expect(hint).toEqual({
      chatId: "chat-1",
      groupId: "group-a",
    });
  });
});

describe("resolveProjectChatDraftThreadStateAfterChatChange", () => {
  it("promotes a pending draft into awaiting_title once a chat id is assigned", () => {
    // New-thread submission should transition into the title-waiting phase as soon as chat creation resolves.
    const next = resolveProjectChatDraftThreadStateAfterChatChange({
      current: { phase: "pending_chat_id" },
      chatHistoryEntriesById: new Map(),
      chatId: "chat-1",
    });

    expect(next).toEqual({
      phase: "awaiting_title",
      chatId: "chat-1",
    });
  });

  it("returns a pending draft to idle when chat selection resets before creation finishes", () => {
    // Resetting the selected chat should preserve the draft instead of silently discarding it.
    const next = resolveProjectChatDraftThreadStateAfterChatChange({
      current: { phase: "pending_chat_id" },
      chatHistoryEntriesById: new Map(),
      chatId: undefined,
    });

    expect(next).toEqual({ phase: "idle" });
  });

  it("clears an idle draft once a real chat becomes selected", () => {
    // Once the surface is back on a concrete chat, the idle draft placeholder should disappear.
    const next = resolveProjectChatDraftThreadStateAfterChatChange({
      current: { phase: "idle" },
      chatHistoryEntriesById: new Map(),
      chatId: "chat-1",
    });

    expect(next).toEqual({ phase: "none" });
  });

  it("clears an awaiting_title draft once the history entry receives a title", () => {
    // Thread-history draft badges should drop away after the backend names the new thread.
    const next = resolveProjectChatDraftThreadStateAfterChatChange({
      current: {
        phase: "awaiting_title",
        chatId: "chat-1",
      } satisfies DraftProjectThreadState,
      chatHistoryEntriesById: new Map([
        [
          "chat-1",
          {
            nameSource: "llm",
          },
        ],
      ]),
      chatId: "chat-1",
    });

    expect(next).toEqual({ phase: "none" });
  });
});
