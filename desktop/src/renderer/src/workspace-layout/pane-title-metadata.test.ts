import { describe, expect, test } from "vitest";

import { chatPaneTitle, paneChromeTitleModel, terminalPaneTitle } from "./pane-title-metadata";
import type { WorkspacePane } from "./types";

describe("pane chrome title metadata", () => {
  test("derives terminal cwd titles with left truncation", () => {
    const model = paneChromeTitleModel(
      fakePane("terminal", "Terminal"),
      terminalPaneTitle("/home/ubuntu/dev"),
    );

    expect(model).toMatchObject({
      fullTitle: "/home/ubuntu/dev",
      icon: "terminal",
      title: "/home/ubuntu/dev",
      truncation: "start",
    });
  });

  test("falls terminal panes back to the terminal label before a cwd is known", () => {
    const model = paneChromeTitleModel(fakePane("terminal", "Build shell"), terminalPaneTitle(""));

    expect(model).toMatchObject({
      icon: "terminal",
      title: "Terminal",
      truncation: "start",
    });
  });

  test("derives chat titles from the sidebar conversation label", () => {
    const model = paneChromeTitleModel(
      fakePane("chat-dom", "Chat"),
      chatPaneTitle("Investigate terminal replay"),
    );

    expect(model).toMatchObject({
      fullTitle: "Investigate terminal replay",
      icon: "chat",
      title: "Investigate terminal replay",
      truncation: "end",
    });
  });

  test("keeps the rest of the pane system icon and title driven by surface kind", () => {
    expect(paneChromeTitleModel(fakePane("workflow-graph", "Workflow Graph"))).toMatchObject({
      icon: "workflow",
      title: "Workflow Graph",
    });
    expect(paneChromeTitleModel(fakePane("settings-dom", "Settings"))).toMatchObject({
      icon: "settings",
      title: "Settings",
    });
    expect(paneChromeTitleModel(fakePane("semantic-node-details", "Semantic Node"))).toMatchObject({
      icon: "network",
      title: "Semantic Node",
    });
  });
});

function fakePane(surfaceKind: WorkspacePane["surfaceKind"], title: string): WorkspacePane {
  return {
    columnId: "column_test",
    heat: 0,
    paneId: "pane_test",
    sequence: 0,
    subtitle: "",
    surfaceId: "surface_test",
    surfaceKind,
    title,
    tone: "slate",
    weight: 1,
  };
}
