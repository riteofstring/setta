import { describe, expect, test } from "vitest";

import {
  rejectedEasyButtonOpenPaneRequestReason,
  resolveWorkspaceOpenPaneRequest,
} from "./open-pane-events";

describe("workspace open pane event", () => {
  test("accepts only non-Easy-Button surface requests", () => {
    expect(resolveWorkspaceOpenPaneRequest(null)).toEqual({ kind: "ignored" });
    expect(resolveWorkspaceOpenPaneRequest({ title: "Untyped" })).toEqual({ kind: "ignored" });

    const settingsRequest = { surfaceKind: "settings-dom", title: "Settings" } as const;
    expect(resolveWorkspaceOpenPaneRequest(settingsRequest)).toEqual({
      kind: "accepted",
      request: settingsRequest,
      surfaceKind: "settings-dom",
    });

    expect(
      resolveWorkspaceOpenPaneRequest({
        easyButtonConfig: { conversationId: "conversation_raw" },
        surfaceKind: "easy-button",
        title: "Raw conversation",
      }),
    ).toEqual({
      kind: "rejected",
      reason: rejectedEasyButtonOpenPaneRequestReason,
    });
  });
});
