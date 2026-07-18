import type { NavigatorItem } from "@generated/backend";
import { describe, expect, test } from "vitest";

import type { ConversationNavigatorWorkspaceState } from "../../stores/conversation-navigator-store";
import { initialEasyButtonPaneDecision } from "./initial-easy-button-pane";

describe("initial Easy Button pane", () => {
  test("waits for both the navigator and mounted workspace layout", () => {
    expect(initialEasyButtonPaneDecision(undefined, undefined)).toEqual({ kind: "wait" });
    expect(initialEasyButtonPaneDecision(navigator([], { loading: true }), 0)).toEqual({
      kind: "wait",
    });
  });

  test("keeps a restored Easy Button pane", () => {
    expect(initialEasyButtonPaneDecision(navigator([]), 1)).toEqual({ kind: "satisfied" });
  });

  test("presents the most recent conversation when no Easy Button is restored", () => {
    const recent = navigatorItem("conversation_recent", "Recent work");
    expect(initialEasyButtonPaneDecision(navigator([recent]), 0)).toEqual({
      item: recent,
      kind: "present",
    });
  });

  test("creates the initial conversation only for an authoritative empty navigator", () => {
    expect(initialEasyButtonPaneDecision(navigator([]), 0)).toEqual({ kind: "create" });
    expect(
      initialEasyButtonPaneDecision(navigator([], { error: "navigator unavailable" }), 0),
    ).toEqual({ kind: "wait" });
  });

  test("restores history but never creates work for an unavailable workspace", () => {
    const recent = navigatorItem("conversation_recent", "Recent work");
    expect(initialEasyButtonPaneDecision(navigator([recent]), 0, false)).toEqual({
      item: recent,
      kind: "present",
    });
    expect(initialEasyButtonPaneDecision(navigator([]), 0, false)).toEqual({ kind: "wait" });
  });
});

function navigator(
  items: readonly NavigatorItem[],
  overrides: Partial<ConversationNavigatorWorkspaceState> = {},
): ConversationNavigatorWorkspaceState {
  return {
    error: null,
    items,
    loading: false,
    nextCursor: null,
    ...overrides,
  };
}

function navigatorItem(id: string, title: string): NavigatorItem {
  return {
    branch: null,
    conversation: {
      archivedAt: null,
      createdAt: "2026-07-15T20:00:00Z",
      id,
      lastTrajectorySequence: 0,
      status: "idle",
      title,
      topicDescriptor: title,
      updatedAt: "2026-07-15T20:00:00Z",
      workspaceId: "workspace_api",
    },
    presentationProfile: {
      conversationId: id,
      narratorSpeechEnabled: true,
      narratorVoiceReuse: null,
      narratorVoiceSelection: "auto_distinct",
      paletteReuse: null,
      paletteSelection: "auto_distinct",
      requestedNarratorVoiceId: null,
      requestedPaletteId: null,
      resolvedNarratorVoiceId: "marin",
      resolvedPaletteId: "sky",
      updatedAt: "2026-07-15T20:00:00Z",
    },
  };
}
