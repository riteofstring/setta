import { describe, expect, test } from "vitest";

import { paneChromeTitleModel } from "./pane-title-metadata";
import type { WorkspacePane } from "./types";

describe("pane chrome title metadata", () => {
  test("applies a surface-provided title override", () => {
    const model = paneChromeTitleModel(fakePane("browser", "Browser"), {
      fullTitle: "Setta documentation",
      title: "Documentation",
      truncation: "end",
    });

    expect(model).toMatchObject({
      fullTitle: "Setta documentation",
      icon: "document",
      title: "Documentation",
      truncation: "end",
    });
  });

  test("falls back to the pane title when an override is blank", () => {
    const model = paneChromeTitleModel(fakePane("empty-frame", "New frame"), {
      title: "  ",
    });

    expect(model).toMatchObject({
      fullTitle: "New frame",
      icon: "document",
      title: "New frame",
      truncation: "end",
    });
  });

  test("keeps pane icons and titles driven by surviving surface kinds", () => {
    expect(paneChromeTitleModel(fakePane("conversation", "Topic Conversation"))).toMatchObject({
      icon: "sparkles",
      title: "Topic Conversation",
    });
    expect(paneChromeTitleModel(fakePane("browser", "Browser"))).toMatchObject({
      icon: "document",
      title: "Browser",
    });
  });
});

function fakePane(surfaceKind: WorkspacePane["surfaceKind"], title: string): WorkspacePane {
  const fields = {
    columnId: "column_test",
    heat: 0,
    paneId: "pane_test",
    sequence: 0,
    subtitle: "",
    surfaceId: "surface_test",
    title,
    tone: "slate" as const,
    weight: 1,
  };
  return surfaceKind === "conversation"
    ? {
        ...fields,
        conversationConfig: { conversationId: "conversation_test" },
        surfaceKind,
      }
    : { ...fields, surfaceKind };
}
