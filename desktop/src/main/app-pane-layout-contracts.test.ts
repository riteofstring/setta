import { describe, expect, test } from "vitest";

import { decodeAppPane, decodeConversationPaneResourceBinding } from "@generated/backend";

describe("generated app pane layout contract", () => {
  test("decodes app master and conversation panes as narrowed variants", () => {
    const masterPane = decodeAppPane(appPane("master", {}, null));
    const conversationPane = decodeAppPane(
      appPane("conversation", null, {
        conversationId: "conversation_alpha",
        presentationIdentity: {
          subtitle: "Topic conversation",
          title: "Topic",
          tone: "cyan",
        },
        resourceBindings: [],
      }),
    );

    expect(masterPane.surfaceKind).toBe("master");
    if (masterPane.surfaceKind !== "master") {
      throw new Error("decoded the wrong app pane variant");
    }
    expect(masterPane.masterConfig).toEqual({});
    expect(conversationPane.surfaceKind).toBe("conversation");
    if (conversationPane.surfaceKind !== "conversation") {
      throw new Error("decoded the wrong app pane variant");
    }
    expect(conversationPane.conversationConfig.conversationId).toBe("conversation_alpha");
  });

  test("rejects removed easy-button app pane records", () => {
    expect(() => decodeAppPane(appPane("easy-button", null, null))).toThrow(
      "AppPane.surfaceKind is unsupported: easy-button",
    );
  });

  test("rejects missing or misplaced app pane configs", () => {
    expect(() => decodeAppPane(appPane("master", null, null))).toThrow(
      "AppPane.masterConfig is required when surfaceKind is master",
    );
    expect(() =>
      decodeAppPane(
        appPane(
          "conversation",
          {},
          {
            conversationId: "conversation_alpha",
            presentationIdentity: {
              subtitle: "Topic conversation",
              title: "Topic",
              tone: "cyan",
            },
            resourceBindings: [],
          },
        ),
      ),
    ).toThrow("AppPane.masterConfig must be null when surfaceKind is conversation");
  });

  test("decodes explicit folder resource bindings", () => {
    const binding = decodeConversationPaneResourceBinding({
      folder: { rootPath: "/tmp/project" },
      kind: "folder",
    });

    expect(binding.folder.rootPath).toBe("/tmp/project");
  });
});

function appPane(
  surfaceKind: string,
  masterConfig: Record<string, never> | null,
  conversationConfig: unknown,
) {
  return {
    columnId: "app_column_0",
    conversationConfig,
    heat: 0,
    masterConfig,
    paneId: "app_pane_0",
    sequence: 0,
    subtitle: "Global coordinator",
    surfaceId: "app_surface_0",
    surfaceKind,
    title: "Setta",
    tone: "slate",
    weight: 1,
  };
}
