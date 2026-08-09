import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { EMPTY_COLLISION_TRACKER_STATE } from "../src/internal/collision-characterization.js";
import { createInteractionRect } from "../src/internal/interaction-geometry.js";
import {
  serializeSectionMovePlan,
  type SectionMovePlan,
} from "../src/internal/section-move-planning.js";
import { resolveWorkspaceSectionKeyboardMove } from "../src/internal/workspace-section-keyboard-move.js";
import { workspaceSectionHierarchySnapshot } from "../src/internal/workspace-section-move-command.js";
import {
  revalidateWorkspaceSectionKeyboardMovePreview,
  type WorkspaceSectionMoveSession,
} from "../src/internal/workspace-section-move-session.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function container(section: WorkspaceSection, sectionIds: readonly string[]): WorkspaceSection {
  return {
    ...section,
    childLayout: {
      orientation: "vertical",
      overflow: "grow",
      positioning: "ordered",
      sectionIds,
    },
  };
}

function keyboardDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "root", title: "Root" },
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "nested", title: "Nested" },
    { id: "grandchild", title: "Grandchild" },
    { id: "empty", title: "Empty" },
  ]);
  return {
    ...flat,
    rootSections: [{ position: { x: 0, y: 0 }, sectionId: "root" }],
    sections: {
      ...flat.sections,
      empty: container(flat.sections.empty as WorkspaceSection, []),
      nested: container(flat.sections.nested as WorkspaceSection, ["grandchild"]),
      root: container(flat.sections.root as WorkspaceSection, ["alpha", "beta", "nested", "empty"]),
    },
  };
}

function region(
  parentSectionId: string,
  x: number,
  y: number,
  orientation: "horizontal" | "vertical" = "vertical",
  direction: "ltr" | "rtl" = "ltr",
) {
  const rect = { height: 360, width: 360, x, y };
  return {
    clientRect: createInteractionRect(x, y, rect.width, rect.height),
    direction,
    gap: 12,
    orientation,
    parentSectionId,
    workspaceRect: rect,
  } as const;
}

function keyboardSession(
  mode: "free" | "sort",
  sectionIds: readonly string[] = ["alpha"],
  regionOverrides?: Readonly<{ direction: "ltr" | "rtl"; orientation: "horizontal" | "vertical" }>,
): WorkspaceSectionMoveSession {
  const document = keyboardDocument();
  const rects = {
    alpha: { height: 80, width: 120, x: 20, y: 20 },
    beta: { height: 80, width: 120, x: 20, y: 112 },
    empty: { height: 360, width: 360, x: 20, y: 500 },
    grandchild: { height: 80, width: 120, x: 420, y: 40 },
    nested: { height: 160, width: 160, x: 20, y: 204 },
    root: { height: 900, width: 800, x: 0, y: 0 },
  };
  const sourceRects = Object.fromEntries(
    sectionIds.map((sectionId) => [sectionId, rects[sectionId as keyof typeof rects]]),
  );
  return {
    activeSectionId: sectionIds[0] as string,
    activeSelectionRootId: sectionIds[0] as string,
    activeSourceParentId: "root",
    activatorClientPoint: null,
    clientRectsById: {},
    collisionState: EMPTY_COLLISION_TRACKER_STATE,
    document,
    freeformRegions: [],
    hierarchy: workspaceSectionHierarchySnapshot(document),
    mode,
    preview: null,
    regions: [
      region("root", 0, 0, regionOverrides?.orientation, regionOverrides?.direction),
      region("nested", 400, 0),
      region("empty", 0, 500),
    ],
    sectionIds,
    sourceClientBounds: { height: 80, width: 120, x: 20, y: 20 },
    sourceParentIds: sectionIds.map(() => "root"),
    sourceRects,
    sourceWorkspaceBounds: { height: 80, width: 120, x: 20, y: 20 },
    startWorkspacePoint: null,
    workspaceRectsById: rects,
  };
}

function nestedKeyboardSession(): WorkspaceSectionMoveSession {
  const session = keyboardSession("free", ["grandchild"]);
  const sourceRect = session.workspaceRectsById.grandchild as NonNullable<
    (typeof session.workspaceRectsById)[string]
  >;
  return {
    ...session,
    activeSectionId: "grandchild",
    activeSelectionRootId: "grandchild",
    activeSourceParentId: "nested",
    sectionIds: ["grandchild"],
    sourceClientBounds: sourceRect,
    sourceParentIds: ["nested"],
    sourceRects: { grandchild: sourceRect },
    sourceWorkspaceBounds: sourceRect,
  };
}

describe("workspace section keyboard movement", () => {
  it("moves to the next vertical sibling boundary through the canonical planner", () => {
    const session = keyboardSession("sort");
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "down",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: {
        plan: {
          destination: { parentId: "root", placement: { index: 1 } },
          sectionIds: ["alpha"],
        },
        status: "planned",
      },
      status: "resolved",
    });
  });

  it("mirrors logical horizontal sibling movement in right-to-left layouts", () => {
    const session = keyboardSession("sort", ["alpha"], {
      direction: "rtl",
      orientation: "horizontal",
    });
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "left",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: { plan: { destination: { placement: { index: 1 } } }, status: "planned" },
      status: "resolved",
    });
    expect(
      resolveWorkspaceSectionKeyboardMove({
        direction: "right",
        document: session.document,
        session,
        validateSectionMove: undefined,
      }),
    ).toMatchObject({ status: "unavailable" });
  });

  it("moves one normalized sibling block to the nearest valid container in arrow direction", () => {
    const session = keyboardSession("free", ["alpha", "beta", "nested"]);
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "right",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: {
        plan: {
          destination: { parentId: "empty", placement: { index: 0 } },
          sectionIds: ["alpha", "beta", "nested"],
        },
        status: "planned",
      },
      status: "resolved",
    });
  });

  it("moves a nested sibling block to the canvas when no container is available beyond its edge", () => {
    const original = keyboardSession("free", ["alpha", "beta"]);
    const session = { ...original, regions: [region("root", 0, 0)] };
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "left",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: {
        plan: {
          destination: {
            parentId: null,
            placement: {
              positions: {
                alpha: { x: 20, y: 20 },
                beta: { x: 20, y: 112 },
              },
            },
          },
          sectionIds: ["alpha", "beta"],
        },
        status: "planned",
      },
      region: null,
      status: "resolved",
    });
  });

  it("uses the active root to keyboard-move a mixed-parent block", () => {
    const original = keyboardSession("free", ["alpha", "grandchild"]);
    const session: WorkspaceSectionMoveSession = {
      ...original,
      sourceParentIds: ["root", "nested"],
    };
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "down",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: {
        plan: {
          destination: { parentId: "root", placement: { index: 1 } },
          sectionIds: ["alpha", "grandchild"],
          sourceParentIds: ["root", "nested"],
        },
        status: "planned",
      },
      status: "resolved",
    });
  });

  it("returns the exact host rejection for the chosen keyboard destination", () => {
    const session = keyboardSession("free", ["alpha", "beta", "nested"]);
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "right",
      document: session.document,
      session,
      validateSectionMove: ({ plan }) =>
        plan.destination.parentId === "empty"
          ? { allowed: false, reason: "Empty stays reserved." }
          : { allowed: true },
    });

    expect(resolution).toMatchObject({
      decision: { reason: "Empty stays reserved.", status: "rejected" },
      destinationIndex: 0,
      status: "resolved",
    });
  });

  it("promotes a valid descendant container above its colliding ancestor region", () => {
    const session = nestedKeyboardSession();
    const resolution = resolveWorkspaceSectionKeyboardMove({
      direction: "down",
      document: session.document,
      session,
      validateSectionMove: undefined,
    });

    expect(resolution).toMatchObject({
      decision: {
        plan: { destination: { parentId: "empty", placement: { index: 0 } } },
        status: "planned",
      },
      status: "resolved",
    });
  });

  it("revalidates the exact displayed keyboard plan at completion", () => {
    const original = keyboardSession("free", ["alpha", "beta", "nested"]);
    const plan = {
      destination: {
        parentId: "empty",
        placement: { index: 0, type: "ordered" },
      },
      mode: "free",
      sectionIds: original.sectionIds,
      sourceParentIds: ["root", "root", "root"],
    } satisfies SectionMovePlan;
    const session: WorkspaceSectionMoveSession = {
      ...original,
      preview: {
        announcement: "Preview",
        destinationKey: serializeSectionMovePlan(plan),
        indicator: {
          kind: "empty",
          rect: { height: 320, width: 320, x: 20, y: 520 },
        },
        plan,
        transformsById: {},
      },
    };
    const resolution = revalidateWorkspaceSectionKeyboardMovePreview({
      session,
      validateSectionMove: undefined,
    });

    expect(resolution.preview?.destinationKey).toBe(serializeSectionMovePlan(plan));
    expect(resolution.preview?.plan).toEqual(plan);
    expect(resolution.reason).toBe("");
  });
});
