import { describe, expect, it } from "vitest";

import type {
  SectionOrientation,
  SectionOverflow,
  WorkspaceCapabilities,
  WorkspaceDocument,
  WorkspaceDocumentChange,
  WorkspaceJsonValue,
  WorkspaceSection,
} from "../src/core.js";
import type { WorkspaceCanvasController } from "../src/internal/workspace-canvas-navigation.js";
import {
  createWorkspaceController,
  type WorkspaceControllerBindings,
} from "../src/internal/workspace-controller.js";
import { WorkspaceDocumentHistory } from "../src/internal/workspace-history.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function orientationDocument(
  orientation: SectionOrientation = "vertical",
  overflow: SectionOverflow = "grow",
): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "container", title: "Container" },
    { id: "first", title: "First" },
    { id: "second", title: "Second" },
  ]);
  const container = flat.sections.container as WorkspaceSection;
  const mainAxis = orientation === "vertical" ? "height" : "width";
  return {
    ...flat,
    rootSections: [flat.rootSections[0] as (typeof flat.rootSections)[number]],
    sections: {
      ...flat.sections,
      container: {
        ...container,
        childLayout: { orientation, overflow, sectionIds: ["first", "second"] },
        size: {
          height: {
            mode: overflow === "scroll" && mainAxis === "height" ? "fixed" : "content",
            value: 360,
          },
          width: {
            mode: overflow === "scroll" && mainAxis === "width" ? "fixed" : "content",
            value: 480,
          },
        },
      },
    },
  };
}

function capabilities(editLayout = true): WorkspaceCapabilities {
  return { editLayout, editPresentation: true, editStructure: true };
}

function measuredCanvas(
  rect: Readonly<{ height: number; width: number; x: number; y: number }> | undefined,
): WorkspaceCanvasController {
  return {
    getSectionRect: (sectionId) => (sectionId === "container" ? rect : undefined),
  } as WorkspaceCanvasController;
}

function fixture(
  initial: WorkspaceDocument,
  options: Readonly<{
    editLayout?: boolean;
    rect?: Readonly<{ height: number; width: number; x: number; y: number }>;
  }> = {},
) {
  let document = initial;
  const changes: WorkspaceDocumentChange[] = [];
  const history = new WorkspaceDocumentHistory(initial);
  const bindings: WorkspaceControllerBindings<WorkspaceJsonValue> = {
    commit: (nextDocument, change) => {
      history.stageCommit(document, nextDocument, change, []);
      document = nextDocument;
      changes.push(change);
    },
    getCapabilities: () => capabilities(options.editLayout),
    getCanvasController: () => measuredCanvas(options.rect),
    getDocument: () => document,
  };
  return {
    changes,
    controller: createWorkspaceController(bindings),
    document: () => document,
    history,
  };
}

describe("workspace section orientation", () => {
  it("changes growing containers without changing hierarchy, child order, or size modes", () => {
    const initial = orientationDocument();
    const initialLayout = initial.sections.container?.childLayout;
    const state = fixture(initial);

    expect(state.controller.setSectionChildOrientation("container", "horizontal")).toEqual({
      status: "applied",
    });

    const container = state.document().sections.container as WorkspaceSection;
    expect(container.childLayout).toEqual({
      orientation: "horizontal",
      overflow: "grow",
      sectionIds: ["first", "second"],
    });
    expect(container.childLayout?.sectionIds).toBe(initialLayout?.sectionIds);
    expect(container.size).toBe(initial.sections.container?.size);
    expect(state.document().rootSections).toBe(initial.rootSections);
    expect(state.document().sections.first).toBe(initial.sections.first);
    expect(state.document().sections.second).toBe(initial.sections.second);
    expect(state.changes).toEqual([{ reason: "section-orientation" }]);
  });

  it("captures the new scroll axis as one undoable orientation change", () => {
    const initial = orientationDocument("vertical", "scroll");
    const state = fixture(initial, { rect: { height: 432.25, width: 618.5, x: 40, y: 60 } });

    expect(state.controller.setSectionChildOrientation("container", "horizontal")).toEqual({
      status: "applied",
    });
    const changed = state.document().sections.container as WorkspaceSection;
    expect(changed.childLayout).toEqual({
      orientation: "horizontal",
      overflow: "scroll",
      sectionIds: ["first", "second"],
    });
    expect(changed.size.height).toEqual({ mode: "fixed", value: 360 });
    expect(changed.size.width).toEqual({ mode: "fixed", value: 618.5 });
    expect(state.changes).toEqual([{ reason: "section-orientation" }]);

    state.history.synchronize(state.document(), [], false);
    const undo = state.history.navigate("undo", state.document(), capabilities());
    expect(undo).toMatchObject({ status: "applied" });
    if (undo.status !== "applied") {
      throw new Error("Expected the orientation transition to be undoable.");
    }
    expect(undo.document).toEqual(initial);
  });

  it("rejects unavailable geometry, policy, constrained lock, minimize, and non-container targets", () => {
    const scrolling = orientationDocument("vertical", "scroll");
    expect(
      fixture(scrolling).controller.setSectionChildOrientation("container", "horizontal"),
    ).toEqual({ reason: "section-geometry-unavailable", status: "rejected" });
    expect(
      fixture(scrolling, { editLayout: false }).controller.setSectionChildOrientation(
        "container",
        "horizontal",
      ),
    ).toEqual({ reason: "layout-edit-disabled", status: "rejected" });

    for (const [field, reason] of [
      ["positionAndSizeLocked", "section-locked"],
      ["isMinimized", "section-minimized"],
    ] as const) {
      const initial = orientationDocument("vertical", "scroll");
      const container = initial.sections.container as WorkspaceSection;
      const state = fixture({
        ...initial,
        sections: { ...initial.sections, container: { ...container, [field]: true } },
      });
      expect(state.controller.setSectionChildOrientation("container", "horizontal")).toEqual({
        reason,
        status: "rejected",
      });
    }

    for (const field of ["positionAndSizeLocked", "isMinimized"] as const) {
      const initial = orientationDocument();
      const container = initial.sections.container as WorkspaceSection;
      const state = fixture({
        ...initial,
        sections: { ...initial.sections, container: { ...container, [field]: true } },
      });
      expect(state.controller.setSectionChildOrientation("container", "horizontal")).toEqual({
        status: "applied",
      });
    }

    const initial = orientationDocument();
    const plain = initial.sections.first as WorkspaceSection;
    const nonContainer = fixture({
      ...initial,
      rootSections: [{ position: { x: 0, y: 0 }, sectionId: "first" }],
      sections: { first: plain },
    });
    expect(nonContainer.controller.setSectionChildOrientation("first", "horizontal")).toEqual({
      reason: "section-not-container",
      status: "rejected",
    });
  });

  it("validates the public orientation value and treats the current value as unchanged", () => {
    const state = fixture(orientationDocument());
    expect(state.controller.setSectionChildOrientation("container", "vertical")).toEqual({
      status: "unchanged",
    });
    expect(() =>
      state.controller.setSectionChildOrientation(
        "container",
        "diagonal" as unknown as SectionOrientation,
      ),
    ).toThrow("Workspace section orientation must be horizontal or vertical.");
    expect(state.changes).toEqual([]);
  });
});
