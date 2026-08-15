import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "../document/documentSelectors";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { updateDndChildren, useDndChildren } from "./dndChildren";
import { useDndState } from "./dndState";
import { BehaviorDropTypeEnum } from "./dropTypes";
import { getBehaviorDropType, getOverId } from "./useDropType";

// The reference's suite also freezes its app-only drop rules (code/terminal attachment,
// frozen variants, the global-variables singleton, top-level-only workflow shells); those rules
// left with their features, so the package suite freezes the two package-side rules — groups
// nest, and never into the dragged selection — plus the over-id resolution.

type SectionSpec = {
  id: string;
  kind?: string;
  children?: Array<string>;
};

function makeSection(spec: SectionSpec): WorkspaceSection {
  return {
    id: spec.id,
    kind: spec.kind ?? "leaf",
    name: spec.id,
    size: { width: 224, height: 96 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: spec.children ?? [],
  };
}

function seedDocument(specs: Array<SectionSpec>) {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  const sections = Object.fromEntries(specs.map((spec) => [spec.id, makeSection(spec)]));
  const childIds = new Set(specs.flatMap((spec) => spec.children ?? []));
  const topLevelSections = Object.fromEntries(
    specs
      .filter((spec) => !childIds.has(spec.id))
      .map((spec, index) => [spec.id, { x: index * 20, y: 0, w: null, h: null, zIndex: index }]),
  );
  loadWorkspaceDocument({
    sections,
    topLevelSections,
    viewport: null,
    activeIds: [],
  });
}

type CollisionInput = {
  id: string;
  containerId?: string;
  intersectionRatio?: number;
};

function collision({ id, containerId, intersectionRatio = 0 }: CollisionInput) {
  const droppable = containerId
    ? {
        data: {
          current: {
            sortable: {
              containerId,
            },
          },
        },
      }
    : undefined;

  return {
    id,
    priority: CollisionPriority.Normal,
    type: CollisionType.Collision,
    value: intersectionRatio,
    data: {
      droppable,
      intersectionRatio,
    },
  } as never;
}

function resetStores() {
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useDndState.getState().reset();
  useDndChildren.getState().reset();
}

describe("getBehaviorDropType", () => {
  beforeEach(() => {
    resetStores();
    useDndState.setState({ draggingIds: [] });
  });

  afterEach(() => {
    resetStores();
  });

  it("allows drops into group sections", () => {
    seedDocument([{ id: "group", kind: GROUP_SECTION_KIND }, { id: "dragged" }]);

    const behavior = getBehaviorDropType("dragged", "group");

    expect(behavior).not.toBe(BehaviorDropTypeEnum.INVALID);
    expect(behavior).toBeNull();
  });

  it("rejects drop targets that are not groups", () => {
    // Validates parent-kind guard for non-container section kinds.
    seedDocument([{ id: "leaf-parent" }, { id: "dragged" }]);

    expect(getBehaviorDropType("dragged", "leaf-parent")).toBe(BehaviorDropTypeEnum.INVALID);
  });

  it("rejects dropping into descendants of selected sections", () => {
    // Validates cycle-prevention guard when target is under dragged selection.
    seedDocument([
      { id: "parent", kind: GROUP_SECTION_KIND, children: ["child"] },
      { id: "child", kind: GROUP_SECTION_KIND },
    ]);

    expect(getBehaviorDropType("parent", "child")).toBe(BehaviorDropTypeEnum.INVALID);
  });

  it("rejects dropping a multi-selection into one of its descendants", () => {
    // Validates the dragging-ids selection feeds the descendant guard.
    seedDocument([
      { id: "parent", kind: GROUP_SECTION_KIND, children: ["child"] },
      { id: "child", kind: GROUP_SECTION_KIND },
      { id: "other" },
    ]);
    useDndState.setState({ draggingIds: ["other", "parent"] });

    expect(getBehaviorDropType("other", "child")).toBe(BehaviorDropTypeEnum.INVALID);
  });
});

describe("getOverId", () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it("returns fallback over id when collisions are missing", () => {
    // Validates fallback behavior from raw over target.
    expect(getOverId({ id: "fallback" }, null)).toBe("fallback");
    expect(getOverId(null, null)).toBeNull();
  });

  it("prefers child collision over parent based on dndChildren mapping", () => {
    // Validates live parent/child store integration in over-id resolution.
    updateDndChildren({
      parent: ["child"],
    });

    const overId = getOverId(null, [
      collision({ id: "parent", intersectionRatio: 10 }),
      collision({ id: "child", intersectionRatio: 1 }),
    ]);

    expect(overId).toBe("child");
  });
});
