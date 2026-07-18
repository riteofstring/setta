import { describe, expect, test } from "vitest";

import { decodeWorkspaceUIPane } from "@generated/backend";

describe("generated workspace UI pane contract", () => {
  test("decodes a bound easy button pane as a narrowed variant", () => {
    const pane = decodeWorkspaceUIPane(
      workspacePane("easy-button", { conversationId: "conversation_alpha" }),
    );

    expect(pane.surfaceKind).toBe("easy-button");
    if (pane.surfaceKind !== "easy-button") {
      throw new Error("decoded the wrong workspace pane variant");
    }
    expect(pane.easyButtonConfig.conversationId).toBe("conversation_alpha");
  });

  test("rejects a missing or misplaced easy button binding", () => {
    expect(() => decodeWorkspaceUIPane(workspacePane("easy-button", null))).toThrow(
      "WorkspaceUIPane.easyButtonConfig is required when surfaceKind is easy-button",
    );
    expect(() =>
      decodeWorkspaceUIPane(workspacePane("empty-frame", { conversationId: "conversation_alpha" })),
    ).toThrow("WorkspaceUIPane.easyButtonConfig must be null when surfaceKind is empty-frame");
  });
});

function workspacePane(
  surfaceKind: "easy-button" | "empty-frame",
  easyButtonConfig: { conversationId: string } | null,
) {
  return {
    columnId: "workspace_column_0",
    easyButtonConfig,
    heat: 0,
    paneId: "workspace_pane_0",
    sequence: 0,
    subtitle: "topic conversation",
    surfaceId: "workspace_surface_0",
    surfaceKind,
    title: "Topic",
    tone: "cyan",
    weight: 1,
  };
}
