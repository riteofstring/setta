import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { applyWorkspaceDocumentCommand } from "../src/internal/document-commands.js";
import {
  serializeSectionMovePlan,
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
    sourceParentId: "container",
    topLevelPositions: null,
    ...overrides,
  };
}

describe("workspace section move command", () => {
  it("serializes every plan field without delimiter or coordinate-rounding collisions", () => {
    const first = plan({
      destinationParentId: null,
      mode: "free",
      sectionIds: ["child+a"],
      sourceParentId: "container:first",
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
      serializeSectionMovePlan({ ...first, sourceParentId: "container:second" }),
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
        sourceParentId: null,
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

    expect(applyWorkspaceSectionMove(document, plan({ sourceParentId: "nested" }))).toEqual({
      reason: "section-move-invalid",
      status: "rejected",
    });
    expect(
      applyWorkspaceSectionMove(document, plan({ destinationIndex: 0, sourceParentId: "nested" })),
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
          sourceParentId: null,
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
          sourceParentId: null,
        }),
      ),
    ).toEqual({ reason: "mixed-parent-selection", status: "rejected" });
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
          sourceParentId: null,
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
