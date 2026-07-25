import { describe, expect, test } from "vitest";

import { decodeWorkspaceUIPane } from "@generated/backend";

describe("generated workspace UI pane contract", () => {
  test("decodes a bound conversation pane as a narrowed variant", () => {
    const pane = decodeWorkspaceUIPane(
      workspacePane("conversation", { conversationId: "conversation_alpha" }),
    );

    expect(pane.surfaceKind).toBe("conversation");
    if (pane.surfaceKind !== "conversation") {
      throw new Error("decoded the wrong workspace pane variant");
    }
    expect(pane.conversationConfig.conversationId).toBe("conversation_alpha");
  });

  test("rejects a missing or misplaced conversation binding", () => {
    expect(() => decodeWorkspaceUIPane(workspacePane("conversation", null))).toThrow(
      "WorkspaceUIPane.conversationConfig is required when surfaceKind is conversation",
    );
    expect(() =>
      decodeWorkspaceUIPane(workspacePane("empty-frame", { conversationId: "conversation_alpha" })),
    ).toThrow("WorkspaceUIPane.conversationConfig must be null when surfaceKind is empty-frame");
  });
});

function workspacePane(
  surfaceKind: "conversation" | "empty-frame",
  conversationConfig: { conversationId: string } | null,
) {
  return {
    columnId: "workspace_column_0",
    conversationConfig,
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
