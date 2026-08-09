import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { applyWorkspaceDocumentCommand } from "../src/internal/document-commands.js";
import {
  resolveWorkspaceSectionMoveDecision,
  serializeSectionMovePlan,
  validateWorkspaceSectionMovePlan,
  type SectionMovePlan,
} from "../src/internal/section-move-planning.js";
import {
  applyWorkspaceSectionMove,
  workspaceDocumentMatchesSectionMove,
  workspaceSectionHierarchySnapshot,
} from "../src/internal/workspace-section-move-command.js";
import {
  resolveWorkspaceSectionInsertionIndex,
  workspaceSectionInsertionIndicator,
} from "../src/internal/workspace-section-move-session.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function container(
  section: WorkspaceSection,
  sectionIds: readonly string[],
  orientation: "horizontal" | "vertical" = "vertical",
): WorkspaceSection {
  return {
    ...section,
    childLayout: { orientation, overflow: "grow", sectionIds },
  };
}

function movementDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root-a", title: "Root A" },
    { id: "root-b", title: "Root B" },
    { id: "container", title: "Container" },
    { id: "child-a", title: "Child A" },
    { id: "child-b", title: "Child B" },
    { id: "nested", title: "Nested" },
    { id: "grandchild", title: "Grandchild" },
    { id: "empty", title: "Empty" },
  ]);
  return {
    ...flat,
    rootSections: [
      { position: { x: 0, y: 0 }, sectionId: "root-a" },
      { position: { x: 120, y: 0 }, sectionId: "root-b" },
      { position: { x: 240, y: 0 }, sectionId: "container" },
      { position: { x: 480, y: 0 }, sectionId: "empty" },
    ],
    sections: {
      ...flat.sections,
      container: container(flat.sections.container as WorkspaceSection, [
        "child-a",
        "child-b",
        "nested",
      ]),
      empty: container(flat.sections.empty as WorkspaceSection, []),
      nested: container(flat.sections.nested as WorkspaceSection, ["grandchild"], "horizontal"),
    },
  };
}

function plan(overrides: Partial<SectionMovePlan> = {}): SectionMovePlan {
  return {
    destinationIndex: 1,
    destinationParentId: "container",
    mode: "sort",
    sectionIds: ["child-a"],
    sourceParentIds: ["container"],
    topLevelPositions: null,
    ...overrides,
  };
}

describe("workspace section move command", () => {
  it("normalizes strict host decisions against an immutable plan snapshot", () => {
    const document = movementDocument();
    const proposedPlan = plan({
      destinationIndex: 0,
      destinationParentId: "empty",
      mode: "free",
    });
    const decision = validateWorkspaceSectionMovePlan(
      document,
      proposedPlan,
      ({ document: currentDocument, plan: receivedPlan }) => {
        expect(currentDocument).toBe(document);
        expect(receivedPlan).toEqual(proposedPlan);
        expect(Object.isFrozen(receivedPlan)).toBe(true);
        expect(Object.isFrozen(receivedPlan.sectionIds)).toBe(true);
        expect(Object.isFrozen(receivedPlan.sourceParentIds)).toBe(true);
        return { allowed: false, reason: "  Empty stays reserved.  " };
      },
    );

    expect(decision).toEqual({ allowed: false, reason: "Empty stays reserved." });
    expect(validateWorkspaceSectionMovePlan(document, proposedPlan, undefined)).toEqual({
      allowed: true,
    });
  });

  it("rejects contradictory, blank, extra, and accessor-backed host decisions", () => {
    expect(() =>
      resolveWorkspaceSectionMoveDecision({
        allowed: true,
        reason: "Contradictory",
      } as unknown as { allowed: true }),
    ).toThrow("cannot provide a reason");
    expect(() => resolveWorkspaceSectionMoveDecision({ allowed: false, reason: "  " })).toThrow(
      "reason must be a non-empty string",
    );
    expect(() =>
      resolveWorkspaceSectionMoveDecision({
        allowed: true,
        source: "host",
      } as unknown as { allowed: true }),
    ).toThrow("section-move decision field source");

    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "allowed", {
      enumerable: true,
      get: () => {
        throw new Error("The decision getter must not run.");
      },
    });
    expect(() =>
      resolveWorkspaceSectionMoveDecision(accessor as unknown as { allowed: true }),
    ).toThrow("section-move decision field allowed");
  });

  it("serializes every plan field without delimiter or coordinate-rounding collisions", () => {
    const first = plan({
      destinationParentId: null,
      mode: "free",
      sectionIds: ["child+a"],
      sourceParentIds: ["container:first"],
      topLevelPositions: { "child+a": { x: 1.0001, y: -0.5 } },
    });

    expect(serializeSectionMovePlan(first)).not.toBe(
      serializeSectionMovePlan({
        ...first,
        sectionIds: ["child", "a"],
        topLevelPositions: {
          a: { x: 1.0001, y: -0.5 },
          child: { x: 1.0001, y: -0.5 },
        },
      }),
    );
    expect(serializeSectionMovePlan(first)).not.toBe(
      serializeSectionMovePlan({ ...first, sourceParentIds: ["container:second"] }),
    );
    expect(serializeSectionMovePlan(first)).not.toBe(
      serializeSectionMovePlan({
        ...first,
        topLevelPositions: { "child+a": { x: 1.0002, y: -0.5 } },
      }),
    );
  });

  it("applies one nested sort without mutating the input document", () => {
    const document = movementDocument();
    const before = structuredClone(document);
    const result = applyWorkspaceSectionMove(document, plan());

    expect(result).toMatchObject({ status: "applied" });
    if (result.status !== "applied") {
      throw new Error("Expected a planned nested sort to apply.");
    }
    expect(result.document.sections.container?.childLayout?.sectionIds).toEqual([
      "child-b",
      "child-a",
      "nested",
    ]);
    expect(result.document.sections["child-a"]).toBe(document.sections["child-a"]);
    expect(result.document.sections.empty).toBe(document.sections.empty);
    expect(result.document.sections.nested).toBe(document.sections.nested);
    expect(result.document.rootSections).toBe(document.rootSections);
    expect(result.document.rootSections[0]).toBe(document.rootSections[0]);
    expect(result.document.rootSections[1]).toBe(document.rootSections[1]);
    expect(document).toEqual(before);
  });

  it("moves a selected sibling block atomically into an empty container", () => {
    const result = applyWorkspaceSectionMove(
      movementDocument(),
      plan({
        destinationIndex: 0,
        destinationParentId: "empty",
        mode: "free",
        sectionIds: ["child-a", "child-b"],
        sourceParentIds: ["container", "container"],
      }),
    );

    expect(result).toMatchObject({ status: "applied" });
    if (result.status !== "applied") {
      throw new Error("Expected a sibling-block free move to apply.");
    }
    expect(result.document.sections.container?.childLayout?.sectionIds).toEqual(["nested"]);
    expect(result.document.sections.empty?.childLayout?.sectionIds).toEqual(["child-a", "child-b"]);
  });

  it("recognizes only the exact canonical document projected by an accepted move", () => {
    const document = movementDocument();
    const move = plan({ destinationIndex: 0, destinationParentId: "empty", mode: "free" });
    const result = applyWorkspaceSectionMove(document, move);

    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      throw new Error("Expected the exact-document move fixture to apply.");
    }
    expect(
      workspaceDocumentMatchesSectionMove(
        result.document,
        workspaceSectionHierarchySnapshot(document),
        move,
      ),
    ).toBe(true);
    expect(
      workspaceDocumentMatchesSectionMove(
        document,
        workspaceSectionHierarchySnapshot(document),
        move,
      ),
    ).toBe(false);
  });

  it("applies canvas-to-nested, nested-to-canvas, and unrelated-depth moves", () => {
    const document = movementDocument();
    const canvasToNested = applyWorkspaceSectionMove(
      document,
      plan({
        destinationIndex: 1,
        mode: "free",
        sectionIds: ["root-a"],
        sourceParentIds: [null],
      }),
    );
    const nestedToCanvas = applyWorkspaceSectionMove(
      document,
      plan({
        destinationIndex: 4,
        destinationParentId: null,
        mode: "free",
        sectionIds: ["child-a"],
        topLevelPositions: { "child-a": { x: -48, y: 264 } },
      }),
    );
    const cousinMove = applyWorkspaceSectionMove(
      document,
      plan({
        destinationIndex: 1,
        destinationParentId: "nested",
        mode: "free",
        sectionIds: ["child-b"],
      }),
    );

    expect(canvasToNested.status).toBe("applied");
    expect(nestedToCanvas.status).toBe("applied");
    expect(cousinMove.status).toBe("applied");
    if (canvasToNested.status === "applied") {
      expect(canvasToNested.document.rootSections.map(({ sectionId }) => sectionId)).toEqual([
        "root-b",
        "container",
        "empty",
      ]);
      expect(canvasToNested.document.sections.container?.childLayout?.sectionIds).toEqual([
        "child-a",
        "root-a",
        "child-b",
        "nested",
      ]);
    }
    if (nestedToCanvas.status === "applied") {
      expect(nestedToCanvas.document.rootSections.at(-1)).toEqual({
        position: { x: -48, y: 264 },
        sectionId: "child-a",
      });
    }
    if (cousinMove.status === "applied") {
      expect(cousinMove.document.sections.nested?.childLayout?.sectionIds).toEqual([
        "grandchild",
        "child-b",
      ]);
    }
  });

  it("moves mixed-parent roots atomically in canonical hierarchy order", () => {
    const result = applyWorkspaceSectionMove(
      movementDocument(),
      plan({
        destinationIndex: 0,
        destinationParentId: "empty",
        mode: "free",
        sectionIds: ["root-a", "child-a"],
        sourceParentIds: [null, "container"],
      }),
    );

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected a mixed-parent section move.");
    expect(result.document.rootSections.map(({ sectionId }) => sectionId)).toEqual([
      "root-b",
      "container",
      "empty",
    ]);
    expect(result.document.sections.container?.childLayout?.sectionIds).toEqual([
      "child-b",
      "nested",
    ]);
    expect(result.document.sections.empty?.childLayout?.sectionIds).toEqual(["root-a", "child-a"]);
  });

  it("moves a legal prototype-mutator section from a container to the canvas", () => {
    const flat = createWorkspaceTestDocument([
      { id: "container", title: "Container" },
      { id: "__proto__", title: "Prototype section" },
    ]);
    const document: WorkspaceDocument = {
      ...flat,
      rootSections: [{ position: { x: 0, y: 0 }, sectionId: "container" }],
      sections: {
        ...flat.sections,
        container: container(flat.sections.container as WorkspaceSection, ["__proto__"]),
      },
    };
    const before = workspaceSectionHierarchySnapshot(document);
    const topLevelPositions = Object.fromEntries([["__proto__", { x: 144, y: 96 }]]) as Readonly<
      Record<string, { x: number; y: number }>
    >;
    const result = applyWorkspaceSectionMove(
      document,
      plan({
        destinationIndex: 1,
        destinationParentId: null,
        mode: "free",
        sectionIds: ["__proto__"],
        sourceParentIds: ["container"],
        topLevelPositions,
      }),
    );

    expect(before.childrenByParent["__proto__"]).toBeUndefined();
    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      throw new Error("Expected the prototype-mutator section move to apply.");
    }
    expect(result.document.rootSections.at(-1)).toEqual({
      position: { x: 144, y: 96 },
      sectionId: "__proto__",
    });
    const after = workspaceSectionHierarchySnapshot(result.document);
    expect(Object.hasOwn(after.rootPositions, "__proto__")).toBe(true);
    expect(after.rootPositions["__proto__"]).toEqual({ x: 144, y: 96 });
  });

  it("rejects stale, cyclic, leaf, and locked plans without partial changes", () => {
    const document = movementDocument();
    const lockedChild = document.sections["child-a"] as WorkspaceSection;
    const lockedDocument = {
      ...document,
      sections: {
        ...document.sections,
        "child-a": { ...lockedChild, positionAndSizeLocked: true },
      },
    };

    expect(applyWorkspaceSectionMove(document, plan({ sourceParentIds: ["nested"] }))).toEqual({
      reason: "section-move-invalid",
      status: "rejected",
    });
    expect(
      applyWorkspaceSectionMove(
        document,
        plan({ destinationIndex: 0, sourceParentIds: ["nested"] }),
      ),
    ).toEqual({ reason: "section-move-invalid", status: "rejected" });
    expect(
      applyWorkspaceSectionMove(
        document,
        plan({ destinationIndex: 0, destinationParentId: "grandchild", mode: "free" }),
      ),
    ).toEqual({ reason: "section-not-container", status: "rejected" });
    expect(
      applyWorkspaceSectionMove(
        document,
        plan({
          destinationIndex: 0,
          destinationParentId: "nested",
          mode: "free",
          sectionIds: ["container"],
          sourceParentIds: [null],
        }),
      ),
    ).toEqual({ reason: "section-move-invalid", status: "rejected" });
    expect(
      applyWorkspaceSectionMove(
        document,
        plan({
          destinationIndex: 0,
          destinationParentId: "empty",
          mode: "free",
          sectionIds: ["root-a", "child-a"],
          sourceParentIds: [null, null],
        }),
      ),
    ).toEqual({ reason: "section-move-invalid", status: "rejected" });
    expect(applyWorkspaceSectionMove(lockedDocument, plan())).toEqual({
      reason: "section-locked",
      status: "rejected",
    });
    expect(
      applyWorkspaceSectionMove(
        document,
        plan({
          destinationParentId: null,
          mode: "free",
          sectionIds: ["root-a"],
          sourceParentIds: [null],
          topLevelPositions: {
            "root-a": { x: 0, y: 0 },
            "root-b": { x: 120, y: 0 },
          },
        }),
      ),
    ).toEqual({ reason: "section-move-invalid", status: "rejected" });
  });

  it("requires both layout and structure capabilities at the reducer boundary", () => {
    const command = { plan: plan(), type: "move-sections" } as const;
    const withoutLayout = applyWorkspaceDocumentCommand(movementDocument(), command, {
      ...WORKSPACE_DEFAULT_CAPABILITIES,
      editLayout: false,
    });
    const withoutStructure = applyWorkspaceDocumentCommand(movementDocument(), command, {
      ...WORKSPACE_DEFAULT_CAPABILITIES,
      editStructure: false,
    });
    const accepted = applyWorkspaceDocumentCommand(
      movementDocument(),
      command,
      WORKSPACE_DEFAULT_CAPABILITIES,
    );

    expect(withoutLayout).toMatchObject({ reason: "layout-edit-disabled", status: "rejected" });
    expect(withoutStructure).toMatchObject({
      reason: "structure-edit-disabled",
      status: "rejected",
    });
    expect(accepted).toMatchObject({ reason: "section-move", status: "applied" });
  });
});

describe("workspace section insertion preview", () => {
  const horizontalRects = [
    { height: 40, width: 80, x: 220, y: 20 },
    { height: 40, width: 80, x: 120, y: 20 },
  ];

  it("resolves vertical, horizontal LTR, and horizontal RTL logical indexes", () => {
    expect(
      resolveWorkspaceSectionInsertionIndex({
        direction: "ltr",
        orderedRects: [
          { height: 80, width: 100, x: 20, y: 20 },
          { height: 80, width: 100, x: 20, y: 120 },
        ],
        orientation: "vertical",
        point: { x: 40, y: 110 },
      }),
    ).toBe(1);
    expect(
      resolveWorkspaceSectionInsertionIndex({
        direction: "ltr",
        orderedRects: [...horizontalRects].reverse(),
        orientation: "horizontal",
        point: { x: 210, y: 30 },
      }),
    ).toBe(1);
    expect(
      resolveWorkspaceSectionInsertionIndex({
        direction: "rtl",
        orderedRects: horizontalRects,
        orientation: "horizontal",
        point: { x: 210, y: 30 },
      }),
    ).toBe(1);
  });

  it("renders a direction-aware line or an empty-container outline without changing layout", () => {
    expect(
      workspaceSectionInsertionIndicator({
        direction: "rtl",
        index: 1,
        orderedRects: horizontalRects,
        orientation: "horizontal",
        regionRect: { height: 80, width: 240, x: 100, y: 0 },
        zoom: 2,
      }),
    ).toEqual({
      kind: "horizontal",
      rect: { height: 74, width: 2, x: 209, y: 3 },
    });
    expect(
      workspaceSectionInsertionIndicator({
        direction: "ltr",
        index: 0,
        orderedRects: [],
        orientation: "vertical",
        regionRect: { height: 80, width: 120, x: 20, y: 40 },
        zoom: 1,
      }),
    ).toEqual({
      kind: "empty",
      rect: { height: 68, width: 108, x: 26, y: 46 },
    });
  });
});
