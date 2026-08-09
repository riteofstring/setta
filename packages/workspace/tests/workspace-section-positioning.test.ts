import { describe, expect, it } from "vitest";

import type {
  WorkspaceChildLayoutPositioningChange,
  WorkspaceDocument,
  WorkspaceSection,
} from "../src/core.js";
import { applyWorkspaceSectionMove } from "../src/internal/workspace-section-move-command.js";
import { planWorkspaceSectionOrientationTransition } from "../src/internal/workspace-section-orientation-command.js";
import { planWorkspaceSectionOverflowTransition } from "../src/internal/workspace-section-overflow-command.js";
import {
  planWorkspaceSectionPositioningTransition,
  resolveWorkspaceChildLayoutPositioningChange,
} from "../src/internal/workspace-section-positioning-command.js";
import { createWorkspaceTestDocument, WorkspaceInMemoryHost } from "../src/testing.js";

function positioningDocument(
  positioning: "freeform" | "ordered" = "ordered",
  overflow: "grow" | "scroll" = "grow",
): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "container", title: "Container" },
    { id: "first", title: "First" },
    { id: "second", title: "Second" },
  ]);
  const container = flat.sections.container as WorkspaceSection;
  const childLayout =
    positioning === "ordered"
      ? {
          orientation: "vertical" as const,
          overflow,
          positioning: "ordered" as const,
          sectionIds: ["first", "second"],
        }
      : {
          overflow,
          positioning: "freeform" as const,
          positions: {
            first: { x: 24, y: 32 },
            second: { x: 312, y: 84 },
          },
          sectionIds: ["first", "second"],
        };
  return {
    ...flat,
    rootSections: [flat.rootSections[0] as (typeof flat.rootSections)[number]],
    sections: {
      ...flat.sections,
      container: {
        ...container,
        childLayout,
        size: {
          height: { mode: overflow === "scroll" ? "fixed" : "content", value: 480 },
          width: {
            mode: overflow === "scroll" && positioning === "freeform" ? "fixed" : "content",
            value: 720,
          },
        },
      },
    },
  };
}

function freeformChange(): WorkspaceChildLayoutPositioningChange {
  return {
    positioning: "freeform",
    positions: {
      first: { x: 24, y: 32 },
      second: { x: 312, y: 84 },
    },
  };
}

describe("workspace child positioning", () => {
  it("switches ordered children to freeform through one undoable layout change", () => {
    const initial = positioningDocument();
    const host = new WorkspaceInMemoryHost(initial);
    host.controller.selectSections(["first"]);
    const change = freeformChange();

    expect(host.controller.setSectionChildPositioning("container", change)).toEqual({
      status: "applied",
    });

    const changed = host.document().sections.container as WorkspaceSection;
    expect(changed.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: {
        first: { x: 24, y: 32 },
        second: { x: 312, y: 84 },
      },
      sectionIds: ["first", "second"],
    });
    expect(changed.childLayout?.sectionIds).toBe(
      initial.sections.container?.childLayout?.sectionIds,
    );
    expect(host.controller.getSelectedSectionIds()).toEqual(["first"]);
    expect(host.changes().map(({ change: committed }) => committed.reason)).toEqual([
      "section-positioning",
    ]);
    expect(host.controller.undo()).toEqual({ status: "applied" });
    expect(host.document().sections.container?.childLayout).toEqual(
      initial.sections.container?.childLayout,
    );
  });

  it("switches freeform children back to one selected ordered orientation", () => {
    const host = new WorkspaceInMemoryHost(positioningDocument("freeform"));

    expect(
      host.controller.setSectionChildPositioning("container", {
        orientation: "horizontal",
        positioning: "ordered",
      }),
    ).toEqual({ status: "applied" });

    expect(host.document().sections.container?.childLayout).toEqual({
      orientation: "horizontal",
      overflow: "grow",
      positioning: "ordered",
      sectionIds: ["first", "second"],
    });
  });

  it("snapshots exact freeform input and rejects malformed maps before publishing", () => {
    const host = new WorkspaceInMemoryHost(positioningDocument());
    const positions = {
      first: { x: 10, y: 20 },
      second: { x: 210, y: 40 },
    };

    expect(
      host.controller.setSectionChildPositioning("container", {
        positioning: "freeform",
        positions,
      }),
    ).toEqual({ status: "applied" });
    positions.first.x = 999;
    const accepted = host.document().sections.container?.childLayout;
    expect(accepted?.positioning).toBe("freeform");
    if (accepted?.positioning !== "freeform") {
      throw new Error("Expected the accepted freeform layout.");
    }
    expect(accepted.positions.first).toEqual({ x: 10, y: 20 });

    const invalidHost = new WorkspaceInMemoryHost(positioningDocument());
    expect(() =>
      invalidHost.controller.setSectionChildPositioning("container", {
        positioning: "freeform",
        positions: { first: { x: 0, y: 0 } },
      }),
    ).toThrow("must match the direct child sections exactly");
    expect(() =>
      invalidHost.controller.setSectionChildPositioning("container", {
        positioning: "freeform",
        positions: {
          first: { x: -1, y: 0 },
          second: { x: 0, y: 0 },
        },
      }),
    ).toThrow("must be a finite non-negative number");
    expect(invalidHost.changes()).toEqual([]);
  });

  it("rejects accessor-backed command positions without evaluating them", () => {
    let evaluated = false;
    const positions = {
      second: { x: 0, y: 0 },
    } as Record<string, { x: number; y: number }>;
    Object.defineProperty(positions, "first", {
      enumerable: true,
      get() {
        evaluated = true;
        return { x: 0, y: 0 };
      },
    });

    expect(() =>
      resolveWorkspaceChildLayoutPositioningChange({ positioning: "freeform", positions }),
    ).toThrow("Invalid workspace freeform position field first");
    expect(evaluated).toBe(false);
  });

  it("rejects unavailable policy, lock, minimize, and non-container transitions", () => {
    const layoutDisabled = new WorkspaceInMemoryHost(positioningDocument(), {
      capabilities: { editLayout: false },
    });
    expect(
      layoutDisabled.controller.setSectionChildPositioning("container", freeformChange()),
    ).toEqual({ reason: "layout-edit-disabled", status: "rejected" });

    for (const [field, reason] of [
      ["positionAndSizeLocked", "section-locked"],
      ["isMinimized", "section-minimized"],
    ] as const) {
      const initial = positioningDocument();
      const container = initial.sections.container as WorkspaceSection;
      const host = new WorkspaceInMemoryHost({
        ...initial,
        sections: { ...initial.sections, container: { ...container, [field]: true } },
      });
      expect(host.controller.setSectionChildPositioning("container", freeformChange())).toEqual({
        reason,
        status: "rejected",
      });
    }

    const initial = positioningDocument();
    const first = initial.sections.first as WorkspaceSection;
    const nonContainer = new WorkspaceInMemoryHost({
      ...initial,
      rootSections: [{ position: { x: 0, y: 0 }, sectionId: "first" }],
      sections: { first },
    });
    expect(nonContainer.controller.setSectionChildPositioning("first", freeformChange())).toEqual({
      reason: "section-not-container",
      status: "rejected",
    });
  });

  it("requires measured cross-axis size when a scrolling ordered layout becomes freeform", () => {
    const document = positioningDocument("ordered", "scroll");
    const container = document.sections.container as WorkspaceSection;

    expect(planWorkspaceSectionPositioningTransition(container, freeformChange(), null)).toEqual({
      reason: "section-geometry-unavailable",
      status: "rejected",
    });

    const transition = planWorkspaceSectionPositioningTransition(container, freeformChange(), {
      height: 482,
      width: 718,
    });
    expect(transition.status).toBe("applied");
    if (transition.status !== "applied") {
      throw new Error("Expected a measured freeform positioning transition.");
    }
    expect(transition.section.size).toEqual({
      height: { mode: "fixed", value: 480 },
      width: { mode: "fixed", value: 718 },
    });
  });

  it("keeps orientation ordered-only and applies freeform overflow on both axes", () => {
    const document = positioningDocument("freeform");
    const container = document.sections.container as WorkspaceSection;

    expect(planWorkspaceSectionOrientationTransition(container, "horizontal", null)).toEqual({
      reason: "section-layout-not-ordered",
      status: "rejected",
    });

    const scrolling = planWorkspaceSectionOverflowTransition(
      container,
      "scroll",
      { height: 520, width: 760 },
      { height: true, width: true },
    );
    expect(scrolling.status).toBe("applied");
    if (scrolling.status !== "applied") {
      throw new Error("Expected freeform scrolling to be applied.");
    }
    expect(scrolling.section.size).toEqual({
      height: { mode: "fixed", value: 520 },
      width: { mode: "fixed", value: 760 },
    });
  });

  it("prunes freeform position keys when deleting or moving a child to the canvas", () => {
    const deletionHost = new WorkspaceInMemoryHost(positioningDocument("freeform"));
    expect(deletionHost.controller.deleteSections(["first"])).toEqual({ status: "applied" });
    expect(deletionHost.document().sections.container?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: { second: { x: 312, y: 84 } },
      sectionIds: ["second"],
    });

    const movement = applyWorkspaceSectionMove(positioningDocument("freeform"), {
      destinationIndex: 1,
      destinationParentId: null,
      mode: "free",
      sectionIds: ["first"],
      sourceParentIds: ["container"],
      topLevelPositions: { first: { x: 640, y: 120 } },
    });
    expect(movement.status).toBe("applied");
    if (movement.status !== "applied") {
      throw new Error("Expected the freeform child to leave for the canvas.");
    }
    expect(movement.document.sections.container?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: { second: { x: 312, y: 84 } },
      sectionIds: ["second"],
    });
  });
});
