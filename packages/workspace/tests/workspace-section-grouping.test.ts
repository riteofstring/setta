import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { applyWorkspaceDocumentCommand } from "../src/internal/document-commands.js";
import type { WorkspaceCanvasController } from "../src/internal/workspace-canvas-navigation.js";
import {
  planWorkspaceSectionGrouping,
  planWorkspaceSectionUngrouping,
  workspaceSectionGroupingMatches,
  workspaceSectionUngroupingMatches,
} from "../src/internal/workspace-section-grouping.js";
import { resolveSectionDefinitions } from "../src/internal/workspace-section-registry.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function groupSection(id = "group"): WorkspaceSection {
  return {
    childLayout: {
      orientation: "vertical",
      overflow: "grow",
      positioning: "ordered",
      sectionIds: [],
    },
    data: null,
    id,
    isMinimized: false,
    kind: "container",
    positionAndSizeLocked: false,
    presentation: { accentColor: null, chrome: "default", tagColor: null },
    size: {
      height: { mode: "fixed", value: 360 },
      width: { mode: "fixed", value: 480 },
    },
    title: "Planning group",
  };
}

function flatDocument(): WorkspaceDocument {
  return createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
  ]);
}

function nestedDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "parent", title: "Parent" },
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "gamma", title: "Gamma" },
    { id: "peer", title: "Peer" },
  ]);
  const parent = flat.sections.parent as WorkspaceSection;
  return {
    ...flat,
    rootSections: [
      flat.rootSections[0] as (typeof flat.rootSections)[number],
      flat.rootSections[4] as (typeof flat.rootSections)[number],
    ],
    sections: {
      ...flat.sections,
      parent: {
        ...parent,
        childLayout: {
          orientation: "horizontal",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: ["alpha", "beta", "gamma"],
        },
      },
    },
  };
}

function nestedFreeformDocument(): WorkspaceDocument {
  const document = nestedDocument();
  const parent = document.sections.parent as WorkspaceSection;
  return {
    ...document,
    sections: {
      ...document.sections,
      parent: {
        ...parent,
        childLayout: {
          overflow: "grow",
          positioning: "freeform",
          positions: {
            alpha: { x: 40, y: 60 },
            beta: { x: 360, y: 80 },
            gamma: { x: 120, y: 300 },
          },
          sectionIds: ["alpha", "beta", "gamma"],
        },
      },
    },
  };
}

function applyGroup(
  document: WorkspaceDocument,
  sectionIds: readonly string[],
  position: Readonly<{ x: number; y: number }> | null,
) {
  return applyWorkspaceDocumentCommand(
    document,
    { group: groupSection(), position, sectionIds, type: "group-sections" },
    WORKSPACE_DEFAULT_CAPABILITIES,
  );
}

function canvasController(
  rects: Readonly<
    Record<string, Readonly<{ height: number; width: number; x: number; y: number }>>
  >,
): WorkspaceCanvasController {
  return {
    getSectionRect: (sectionId) => rects[sectionId],
  } as WorkspaceCanvasController;
}

const registry = resolveSectionDefinitions([
  {
    canContainSections: true,
    defaultChildOrientation: "vertical",
    defaultSize: { height: 320, width: 400 },
    displayName: "Container",
    kind: "container",
    render: () => null,
    resize: { axes: "both", maxSize: { height: 600, width: 600 } },
  },
]);

describe("workspace section grouping commands", () => {
  it("groups top-level siblings in canonical order at the first selected stack index", () => {
    const result = applyGroup(flatDocument(), ["gamma", "alpha"], { x: 40, y: 60 });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      throw new Error("Expected top-level grouping to apply.");
    }
    expect(result.reason).toBe("section-group");
    expect(result.document.rootSections).toEqual([
      { position: { x: 40, y: 60 }, sectionId: "group" },
      { position: { x: 280, y: 0 }, sectionId: "beta" },
    ]);
    expect(result.document.sections.group?.childLayout?.sectionIds).toEqual(["alpha", "gamma"]);
    expect(result.document.sections.alpha?.id).toBe("alpha");
    expect(result.document.sections.gamma?.id).toBe("gamma");
  });

  it("groups and ungroups nested siblings at their first selected index", () => {
    const grouped = applyGroup(nestedDocument(), ["gamma", "beta"], null);
    if (grouped.status !== "applied") {
      throw new Error("Expected nested grouping to apply.");
    }
    expect(grouped.document.sections.parent?.childLayout?.sectionIds).toEqual(["alpha", "group"]);
    expect(grouped.document.sections.group?.childLayout?.sectionIds).toEqual(["beta", "gamma"]);
    expect(
      workspaceSectionGroupingMatches(grouped.document, "group", "parent", ["beta", "gamma"]),
    ).toBe(true);
    expect(
      workspaceSectionGroupingMatches(grouped.document, "group", null, ["beta", "gamma"]),
    ).toBe(false);

    const ungrouped = applyWorkspaceDocumentCommand(
      grouped.document,
      { positions: null, sectionId: "group", type: "ungroup-section" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(ungrouped.status).toBe("applied");
    if (ungrouped.status !== "applied") {
      throw new Error("Expected nested ungrouping to apply.");
    }
    expect(ungrouped.reason).toBe("section-ungroup");
    expect(ungrouped.document.sections.parent?.childLayout?.sectionIds).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(ungrouped.document.sections.group).toBeUndefined();
    expect(
      workspaceSectionUngroupingMatches(ungrouped.document, "group", "parent", ["beta", "gamma"]),
    ).toBe(true);
    expect(
      workspaceSectionUngroupingMatches(ungrouped.document, "group", null, ["beta", "gamma"]),
    ).toBe(false);
  });

  it("replaces every selected nested freeform position without leaving stale keys", () => {
    const grouped = applyGroup(nestedFreeformDocument(), ["gamma", "alpha"], { x: 40, y: 60 });
    expect(grouped.status).toBe("applied");
    if (grouped.status !== "applied") {
      throw new Error("Expected nested freeform grouping to apply.");
    }
    expect(grouped.document.sections.parent?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: { beta: { x: 360, y: 80 }, group: { x: 40, y: 60 } },
      sectionIds: ["group", "beta"],
    });
    expect(grouped.document.sections.group?.childLayout?.sectionIds).toEqual(["alpha", "gamma"]);

    const ungrouped = applyWorkspaceDocumentCommand(
      grouped.document,
      {
        positions: { alpha: { x: 60, y: 110 }, gamma: { x: 80, y: 330 } },
        sectionId: "group",
        type: "ungroup-section",
      },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(ungrouped.status).toBe("applied");
    if (ungrouped.status !== "applied") {
      throw new Error("Expected nested freeform ungrouping to apply.");
    }
    expect(ungrouped.document.sections.parent?.childLayout).toEqual({
      overflow: "grow",
      positioning: "freeform",
      positions: {
        alpha: { x: 60, y: 110 },
        beta: { x: 360, y: 80 },
        gamma: { x: 80, y: 330 },
      },
      sectionIds: ["alpha", "gamma", "beta"],
    });
    expect(ungrouped.document.sections.group).toBeUndefined();
  });

  it("promotes top-level children with the exact planned positions", () => {
    const grouped = applyGroup(flatDocument(), ["alpha", "beta"], { x: 40, y: 60 });
    if (grouped.status !== "applied") {
      throw new Error("Expected top-level grouping to apply.");
    }
    const ungrouped = applyWorkspaceDocumentCommand(
      grouped.document,
      {
        positions: { alpha: { x: 40, y: 60 }, beta: { x: 40, y: 264 } },
        sectionId: "group",
        type: "ungroup-section",
      },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );

    expect(ungrouped.status).toBe("applied");
    if (ungrouped.status !== "applied") {
      throw new Error("Expected top-level ungrouping to apply.");
    }
    expect(ungrouped.document.rootSections).toEqual([
      { position: { x: 40, y: 60 }, sectionId: "alpha" },
      { position: { x: 40, y: 264 }, sectionId: "beta" },
      { position: { x: 560, y: 0 }, sectionId: "gamma" },
    ]);
    expect(ungrouped.document.sections.group).toBeUndefined();
  });

  it("rejects undersized, mixed-parent, unavailable, and partially authorized actions", () => {
    expect(applyGroup(flatDocument(), ["alpha"], { x: 0, y: 0 })).toMatchObject({
      reason: "group-selection-too-small",
      status: "rejected",
    });
    expect(applyGroup(nestedDocument(), ["alpha", "peer"], { x: 0, y: 0 })).toMatchObject({
      reason: "mixed-parent-selection",
      status: "rejected",
    });
    expect(
      applyWorkspaceDocumentCommand(
        flatDocument(),
        {
          group: groupSection(),
          position: { x: 0, y: 0 },
          sectionIds: ["alpha", "beta"],
          type: "group-sections",
        },
        { editLayout: false, editPresentation: true, editStructure: true },
      ),
    ).toMatchObject({ reason: "layout-edit-disabled", status: "rejected" });
    expect(
      applyWorkspaceDocumentCommand(
        flatDocument(),
        { positions: {}, sectionId: "alpha", type: "ungroup-section" },
        WORKSPACE_DEFAULT_CAPABILITIES,
      ),
    ).toMatchObject({ reason: "section-not-container", status: "rejected" });
    expect(() => applyGroup(nestedFreeformDocument(), ["alpha", "gamma"], { x: -1, y: 0 })).toThrow(
      'Workspace freeform position for "group" coordinates must be non-negative.',
    );
  });
});

describe("workspace section grouping planning", () => {
  it("measures every selected root before invoking the host factory", () => {
    let factoryCalls = 0;
    const factory = () => {
      factoryCalls += 1;
      return { data: null, id: "group", kind: "container", title: "Planning group" };
    };

    expect(
      planWorkspaceSectionGrouping({
        canvasController: null,
        document: flatDocument(),
        factory,
        registry,
        sectionIds: ["alpha", "beta"],
      }),
    ).toEqual({ reason: "canvas-unavailable", status: "rejected" });
    expect(
      planWorkspaceSectionGrouping({
        canvasController: canvasController({ alpha: { height: 180, width: 240, x: 0, y: 0 } }),
        document: flatDocument(),
        factory,
        registry,
        sectionIds: ["alpha", "beta"],
      }),
    ).toEqual({ reason: "section-geometry-unavailable", status: "rejected" });
    expect(factoryCalls).toBe(0);
  });

  it("places and sizes a group from combined measured bounds", () => {
    const plan = planWorkspaceSectionGrouping({
      canvasController: canvasController({
        alpha: { height: 180, width: 240, x: 40, y: 80 },
        beta: { height: 200, width: 240, x: 400, y: 140 },
      }),
      document: flatDocument(),
      factory: ({ parentSectionId, sectionIds }) => {
        expect(parentSectionId).toBeNull();
        expect(sectionIds).toEqual(["alpha", "beta"]);
        return { data: null, id: "group", kind: "container", title: "  Planning group  " };
      },
      registry,
      sectionIds: ["beta", "alpha"],
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") {
      throw new Error("Expected grouping plan to be ready.");
    }
    expect(plan.position).toEqual({ x: 40, y: 80 });
    expect(plan.group).toMatchObject({
      childLayout: {
        orientation: "vertical",
        overflow: "grow",
        positioning: "ordered",
        sectionIds: [],
      },
      size: {
        height: { mode: "fixed", value: 260 },
        width: { mode: "fixed", value: 600 },
      },
      title: "Planning group",
    });
  });

  it("places a nested freeform group from canonical local positions and measured sizes", () => {
    const plan = planWorkspaceSectionGrouping({
      canvasController: canvasController({
        alpha: { height: 180, width: 240, x: 880, y: 420 },
        gamma: { height: 200, width: 240, x: 960, y: 660 },
      }),
      document: nestedFreeformDocument(),
      factory: () => ({
        data: null,
        id: "group",
        kind: "container",
        title: "Planning group",
      }),
      registry,
      sectionIds: ["gamma", "alpha"],
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") {
      throw new Error("Expected nested freeform grouping to be ready.");
    }
    expect(plan.position).toEqual({ x: 40, y: 60 });
    expect(plan.group.size).toEqual({
      height: { mode: "fixed", value: 440 },
      width: { mode: "fixed", value: 320 },
    });
  });

  it("derives nested freeform ungroup positions from measured child geometry", () => {
    const grouped = applyGroup(nestedFreeformDocument(), ["alpha", "gamma"], { x: 40, y: 60 });
    if (grouped.status !== "applied") {
      throw new Error("Expected nested freeform grouping to apply.");
    }
    const plan = planWorkspaceSectionUngrouping({
      canvasController: canvasController({
        alpha: { height: 180, width: 240, x: 520, y: 350 },
        gamma: { height: 200, width: 240, x: 540, y: 570 },
        group: { height: 440, width: 320, x: 500, y: 300 },
      }),
      document: grouped.document,
      sectionId: "group",
    });

    expect(plan).toEqual({
      childSectionIds: ["alpha", "gamma"],
      parentSectionId: "parent",
      positions: { alpha: { x: 60, y: 110 }, gamma: { x: 80, y: 330 } },
      status: "ready",
    });
  });

  it("translates a promoted freeform block together at nested start edges", () => {
    const grouped = applyGroup(nestedFreeformDocument(), ["alpha", "gamma"], { x: 0, y: 0 });
    if (grouped.status !== "applied") {
      throw new Error("Expected nested freeform grouping to apply.");
    }
    const plan = planWorkspaceSectionUngrouping({
      canvasController: canvasController({
        alpha: { height: 180, width: 240, x: 480, y: 280 },
        gamma: { height: 200, width: 240, x: 540, y: 340 },
        group: { height: 440, width: 320, x: 500, y: 300 },
      }),
      document: grouped.document,
      sectionId: "group",
    });

    expect(plan).toMatchObject({
      positions: { alpha: { x: 0, y: 0 }, gamma: { x: 60, y: 60 } },
      status: "ready",
    });
  });

  it("plans non-overlapping root positions from the measured group frame", () => {
    const grouped = applyGroup(flatDocument(), ["alpha", "beta"], { x: 100, y: 50 });
    if (grouped.status !== "applied") {
      throw new Error("Expected top-level grouping to apply.");
    }
    const plan = planWorkspaceSectionUngrouping({
      canvasController: canvasController({
        gamma: { height: 180, width: 240, x: 100, y: 50 },
        group: { height: 420, width: 480, x: 100, y: 50 },
      }),
      document: grouped.document,
      sectionId: "group",
    });

    expect(plan).toMatchObject({
      childSectionIds: ["alpha", "beta"],
      parentSectionId: null,
      positions: { alpha: { x: 100, y: 254 }, beta: { x: 100, y: 458 } },
      status: "ready",
    });
  });

  it("retains prototype-mutator child IDs in planned top-level ungroup positions", () => {
    const document = createWorkspaceTestDocument([
      { id: "__proto__", title: "Prototype child" },
      { id: "beta", title: "Beta" },
    ]);
    const grouped = applyGroup(document, ["__proto__", "beta"], { x: 100, y: 50 });
    if (grouped.status !== "applied") {
      throw new Error("Expected prototype-mutator grouping to apply.");
    }
    const plan = planWorkspaceSectionUngrouping({
      canvasController: canvasController({
        group: { height: 420, width: 480, x: 100, y: 50 },
      }),
      document: grouped.document,
      sectionId: "group",
    });
    if (plan.status !== "ready" || !plan.positions) {
      throw new Error("Expected prototype-mutator ungrouping to be ready.");
    }

    expect(Object.hasOwn(plan.positions, "__proto__")).toBe(true);
    expect(plan.positions["__proto__"]).toEqual({ x: 100, y: 50 });
    const ungrouped = applyWorkspaceDocumentCommand(
      grouped.document,
      { positions: plan.positions, sectionId: "group", type: "ungroup-section" },
      WORKSPACE_DEFAULT_CAPABILITIES,
    );
    expect(ungrouped.status).toBe("applied");
    if (ungrouped.status === "applied") {
      expect(ungrouped.document.rootSections.map(({ sectionId }) => sectionId)).toEqual([
        "__proto__",
        "beta",
      ]);
    }
  });

  it("rejects malformed group factory results without evaluating accessors", () => {
    let evaluated = false;
    const result = Object.defineProperty({ data: null, id: "group", kind: "container" }, "title", {
      enumerable: true,
      get: () => {
        evaluated = true;
        return "Planning group";
      },
    });

    expect(() =>
      planWorkspaceSectionGrouping({
        canvasController: canvasController({
          alpha: { height: 180, width: 240, x: 0, y: 0 },
          beta: { height: 180, width: 240, x: 280, y: 0 },
        }),
        document: flatDocument(),
        factory: () => result as never,
        registry,
        sectionIds: ["alpha", "beta"],
      }),
    ).toThrow("workspace group factory result field title");
    expect(evaluated).toBe(false);
  });
});
