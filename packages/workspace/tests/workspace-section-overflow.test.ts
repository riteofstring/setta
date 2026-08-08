import { describe, expect, it } from "vitest";

import type {
  WorkspaceCapabilities,
  WorkspaceDocument,
  WorkspaceDocumentChange,
  WorkspaceJsonValue,
  WorkspaceSection,
} from "../src/core.js";
import {
  setWorkspaceSectionChildOverflow,
  type WorkspaceControllerBindings,
} from "../src/internal/workspace-controller.js";
import { WorkspaceDocumentHistory } from "../src/internal/workspace-history.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function overflowDocument(orientation: "horizontal" | "vertical" = "vertical"): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "container", title: "Container" },
    { id: "child", title: "Child" },
  ]);
  const container = flat.sections.container as WorkspaceSection;
  return {
    ...flat,
    rootSections: [flat.rootSections[0] as (typeof flat.rootSections)[number]],
    sections: {
      ...flat.sections,
      container: {
        ...container,
        childLayout: { orientation, overflow: "grow" as const, sectionIds: ["child"] },
        size: {
          height: { mode: orientation === "vertical" ? "content" : "fixed", value: 240 },
          width: { mode: orientation === "horizontal" ? "content" : "fixed", value: 360 },
        },
      },
    },
  };
}

function capabilities(editLayout = true): WorkspaceCapabilities {
  return { editLayout, editPresentation: true, editStructure: true };
}

function fixture(initial: WorkspaceDocument, editLayout = true) {
  let document = initial;
  const changes: WorkspaceDocumentChange[] = [];
  const history = new WorkspaceDocumentHistory(initial);
  const bindings: WorkspaceControllerBindings<WorkspaceJsonValue> = {
    commit: (nextDocument, change) => {
      history.stageCommit(document, nextDocument, change, []);
      document = nextDocument;
      changes.push(change);
    },
    getCapabilities: () => capabilities(editLayout),
    getDocument: () => document,
  };
  return { bindings, changes, document: () => document, history };
}

describe("workspace child overflow", () => {
  it.each([
    ["vertical", "height", 418.25],
    ["horizontal", "width", 612.5],
  ] as const)(
    "captures measured %s main-axis size and restores content growth",
    (orientation, axis, measurement) => {
      const initial = overflowDocument(orientation);
      const state = fixture(initial);

      expect(
        setWorkspaceSectionChildOverflow(
          state.bindings,
          "container",
          "scroll",
          {
            height: axis === "height" ? measurement : 240,
            width: axis === "width" ? measurement : 360,
          },
          true,
        ),
      ).toEqual({ status: "applied" });

      const scrolled = state.document().sections.container as WorkspaceSection;
      expect(scrolled.childLayout).toEqual({
        orientation,
        overflow: "scroll",
        sectionIds: ["child"],
      });
      expect(scrolled.size[axis]).toEqual({ mode: "fixed", value: measurement });
      expect(state.changes).toEqual([{ reason: "section-overflow" }]);

      expect(
        setWorkspaceSectionChildOverflow(state.bindings, "container", "grow", null, true),
      ).toEqual({ status: "applied" });
      expect((state.document().sections.container as WorkspaceSection).size[axis]).toEqual({
        mode: "content",
        value: measurement,
      });
      expect(state.document().sections.container?.childLayout?.sectionIds).toEqual(["child"]);
    },
  );

  it("records the combined overflow and size transition as one undoable change", () => {
    const initial = overflowDocument();
    const state = fixture(initial);
    setWorkspaceSectionChildOverflow(
      state.bindings,
      "container",
      "scroll",
      { height: 420, width: 360 },
      true,
    );
    state.history.synchronize(state.document(), [], false);

    const undo = state.history.navigate("undo", state.document(), capabilities());
    expect(undo).toMatchObject({ status: "applied" });
    if (undo.status !== "applied") {
      throw new Error("Expected the overflow transition to be undoable.");
    }
    expect(undo.document).toEqual(initial);
  });

  it("rejects unavailable geometry, policy, lock, minimize, and non-container targets", () => {
    const initial = overflowDocument();
    const withoutGeometry = fixture(initial);
    expect(
      setWorkspaceSectionChildOverflow(withoutGeometry.bindings, "container", "scroll", null, true),
    ).toEqual({ reason: "section-geometry-unavailable", status: "rejected" });

    const layoutDisabled = fixture(initial, false);
    expect(
      setWorkspaceSectionChildOverflow(
        layoutDisabled.bindings,
        "container",
        "scroll",
        { height: 420, width: 360 },
        true,
      ),
    ).toEqual({ reason: "layout-edit-disabled", status: "rejected" });

    for (const [field, reason] of [
      ["positionAndSizeLocked", "section-locked"],
      ["isMinimized", "section-minimized"],
    ] as const) {
      const section = initial.sections.container as WorkspaceSection;
      const state = fixture({
        ...initial,
        sections: { ...initial.sections, container: { ...section, [field]: true } },
      });
      expect(
        setWorkspaceSectionChildOverflow(
          state.bindings,
          "container",
          "scroll",
          { height: 420, width: 360 },
          true,
        ),
      ).toEqual({ reason, status: "rejected" });
    }

    const plain = initial.sections.child as WorkspaceSection;
    const nonContainer = fixture({
      ...initial,
      rootSections: [{ position: { x: 0, y: 0 }, sectionId: "child" }],
      sections: { child: plain },
    });
    expect(
      setWorkspaceSectionChildOverflow(
        nonContainer.bindings,
        "child",
        "scroll",
        { height: 180, width: 240 },
        true,
      ),
    ).toEqual({ reason: "section-not-container", status: "rejected" });
  });

  it("keeps fixed sizing when the section kind does not support content growth", () => {
    const initial = overflowDocument();
    const state = fixture(initial);
    setWorkspaceSectionChildOverflow(
      state.bindings,
      "container",
      "scroll",
      { height: 420, width: 360 },
      false,
    );
    setWorkspaceSectionChildOverflow(state.bindings, "container", "grow", null, false);

    expect((state.document().sections.container as WorkspaceSection).size.height).toEqual({
      mode: "fixed",
      value: 420,
    });
  });
});
