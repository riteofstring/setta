import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceCapabilities,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import {
  resolveWorkspaceHistoryShortcut,
  WorkspaceDocumentHistory,
} from "../src/internal/workspace-history.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function renamedDocument(document: WorkspaceDocument, title: string): WorkspaceDocument {
  const section = document.sections.alpha as WorkspaceSection;
  return {
    ...document,
    sections: { ...document.sections, alpha: { ...section, title } },
  };
}

function capabilities(overrides: Partial<WorkspaceCapabilities> = {}): WorkspaceCapabilities {
  return { ...WORKSPACE_DEFAULT_CAPABILITIES, ...overrides };
}

describe("workspace structural history", () => {
  it("undoes and redoes committed changes while preserving the live viewport", () => {
    const host = new WorkspaceInMemoryHost(
      createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]),
    );

    expect(host.controller.getHistoryState()).toEqual({ canRedo: false, canUndo: false });
    expect(host.controller.setSectionTitle("alpha", "Renamed")).toEqual({ status: "applied" });
    expect(host.controller.setViewport({ x: 48, y: -24, zoom: 1.5 })).toEqual({
      status: "applied",
    });
    expect(host.controller.getHistoryState()).toEqual({ canRedo: false, canUndo: true });

    expect(host.controller.undo()).toEqual({ status: "applied" });
    expect(host.document().sections.alpha?.title).toBe("Alpha");
    expect(host.document().viewport).toEqual({ x: 48, y: -24, zoom: 1.5 });
    expect(host.controller.getHistoryState()).toEqual({ canRedo: true, canUndo: false });

    expect(host.controller.redo()).toEqual({ status: "applied" });
    expect(host.document().sections.alpha?.title).toBe("Renamed");
    expect(host.document().viewport).toEqual({ x: 48, y: -24, zoom: 1.5 });
    expect(host.changes().map(({ change }) => change.reason)).toEqual([
      "section-title",
      "viewport",
      "history-undo",
      "history-redo",
    ]);
  });

  it("restores selection around subtree deletion and clears redo after a new branch", () => {
    const host = new WorkspaceInMemoryHost(
      createWorkspaceTestDocument([
        { id: "alpha", title: "Alpha" },
        { id: "beta", title: "Beta" },
      ]),
    );
    host.controller.selectSections(["alpha"]);
    host.controller.deleteSections(["alpha"]);

    expect(host.controller.getSelectedSectionIds()).toEqual([]);
    expect(host.controller.undo()).toEqual({ status: "applied" });
    expect(host.controller.getSelectedSectionIds()).toEqual(["alpha"]);
    expect(host.controller.redo()).toEqual({ status: "applied" });
    expect(host.controller.getSelectedSectionIds()).toEqual([]);
    expect(host.controller.undo()).toEqual({ status: "applied" });

    host.controller.setSectionTitle("beta", "Beta branch");
    expect(host.controller.getHistoryState()).toEqual({ canRedo: false, canUndo: true });
  });

  it("records only a controlled proposal that the host accepts", () => {
    const initial = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const accepted = renamedDocument(initial, "Accepted");
    const history = new WorkspaceDocumentHistory(initial);

    history.stageCommit(initial, accepted, { reason: "section-title" }, ["alpha"]);
    expect(history.synchronize(initial, ["alpha"], true)).toMatchObject({
      navigationRejected: false,
      stateChanged: true,
    });
    expect(history.state(capabilities())).toEqual({ canRedo: false, canUndo: false });

    history.stageCommit(initial, accepted, { reason: "section-title" }, ["alpha"]);
    expect(history.synchronize(accepted, ["alpha"], true)).toMatchObject({
      navigationAccepted: false,
      stateChanged: true,
    });
    expect(history.state(capabilities())).toEqual({ canRedo: false, canUndo: true });
  });

  it("keeps adjacent synchronous commits as separate undo steps", () => {
    const initial = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const first = renamedDocument(initial, "First");
    const second = renamedDocument(first, "Second");
    const history = new WorkspaceDocumentHistory(initial);

    history.stageCommit(initial, first, { reason: "section-title" }, ["alpha"]);
    history.stageCommit(first, second, { reason: "section-title" }, ["alpha"]);
    history.synchronize(second, ["alpha"], false);

    const firstUndo = history.navigate("undo", second, capabilities());
    expect(firstUndo).toMatchObject({ document: first, status: "applied" });
    if (firstUndo.status !== "applied") {
      throw new Error("Expected the second synchronous commit to be undoable.");
    }
    history.synchronize(firstUndo.document, ["alpha"], false);

    const secondUndo = history.navigate("undo", firstUndo.document, capabilities());
    expect(secondUndo).toMatchObject({ document: initial, status: "applied" });
  });

  it("keeps accepted stacks after a rejected controlled undo and clears them on divergence", () => {
    const initial = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const accepted = renamedDocument(initial, "Accepted");
    const divergent = renamedDocument(initial, "External replacement");
    const history = new WorkspaceDocumentHistory(initial);
    history.stageCommit(initial, accepted, { reason: "section-title" }, ["alpha"]);
    history.synchronize(accepted, ["alpha"], true);

    expect(history.navigate("undo", accepted, capabilities()).status).toBe("applied");
    expect(history.synchronize(accepted, ["alpha"], true)).toMatchObject({
      direction: "undo",
      navigationRejected: true,
    });
    expect(history.state(capabilities())).toEqual({ canRedo: false, canUndo: true });

    history.synchronize(divergent, ["alpha"], true);
    expect(history.state(capabilities())).toEqual({ canRedo: false, canUndo: false });
  });

  it("retains history while live capabilities disable its next category", () => {
    const initial = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const accepted = renamedDocument(initial, "Accepted");
    const history = new WorkspaceDocumentHistory(initial);
    history.stageCommit(initial, accepted, { reason: "section-title" }, ["alpha"]);
    history.synchronize(accepted, ["alpha"], false);

    expect(history.state(capabilities({ editPresentation: false }))).toEqual({
      canRedo: false,
      canUndo: false,
    });
    expect(history.navigate("undo", accepted, capabilities({ editPresentation: false }))).toEqual({
      reason: "presentation-edit-disabled",
      status: "rejected",
    });
    expect(history.state(capabilities())).toEqual({ canRedo: false, canUndo: true });
  });

  it("resolves standard undo and redo shortcuts without stealing modified keys", () => {
    const event = {
      altKey: false,
      ctrlKey: true,
      key: "z",
      metaKey: false,
      shiftKey: false,
    };
    expect(resolveWorkspaceHistoryShortcut(event)).toBe("undo");
    expect(resolveWorkspaceHistoryShortcut({ ...event, shiftKey: true })).toBe("redo");
    expect(resolveWorkspaceHistoryShortcut({ ...event, key: "y" })).toBe("redo");
    expect(resolveWorkspaceHistoryShortcut({ ...event, altKey: true })).toBeNull();
    expect(resolveWorkspaceHistoryShortcut({ ...event, ctrlKey: false })).toBeNull();
  });
});
