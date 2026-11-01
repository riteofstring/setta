import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "../document/documentSelectors.js";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores.js";
import type { WorkspaceSection } from "../document/types.js";
import { updateDndChildren, useDndChildren } from "./dndChildren.js";
import { useDndState } from "./dndState.js";
import { BehaviorDropTypeEnum } from "./dropTypes.js";
import { getBehaviorDropType, getOverId } from "./useDropType.js";

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

function seedDocument(
  specs: Array<SectionSpec>,
  canAcceptNestedSection?: (section: WorkspaceSection) => boolean,
) {
  registerSectionKinds(testWorkspace.host, {
    accepted: { renderContent: () => null },
    leaf: { renderContent: () => null },
    list: {
      renderContent: () => null,
      nestedSections: "vertical",
      ...(canAcceptNestedSection ? { canAcceptNestedSection } : {}),
    },
    rejected: { renderContent: () => null },
  });
  const sections = Object.fromEntries(
    specs.map((spec) => [spec.id, makeSection(spec)]),
  );
  const childIds = new Set(specs.flatMap((spec) => spec.children ?? []));
  const topLevelSections = Object.fromEntries(
    specs
      .filter((spec) => !childIds.has(spec.id))
      .map((spec, index) => [
        spec.id,
        { x: index * 20, y: 0, w: null, h: null, zIndex: index },
      ]),
  );
  loadWorkspaceDocument(testWorkspace.host, {
    sections,
    topLevelSections,
    viewport: null,
    activeIds: [],
    savedViews: null,
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
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.dndState.getState().reset();
  testWorkspace.dndChildren.getState().reset();
}

describe("getBehaviorDropType", () => {
  beforeEach(() => {
    resetStores();
    testWorkspace.dndState.setState({ draggingIds: [] });
  });

  afterEach(() => {
    resetStores();
  });

  it("allows drops into group sections", () => {
    seedDocument([
      { id: "group", kind: GROUP_SECTION_KIND },
      { id: "dragged" },
    ]);

    const behavior = getBehaviorDropType(
      testWorkspace.host,
      "dragged",
      "group",
    );

    expect(behavior).not.toBe(BehaviorDropTypeEnum.INVALID);
    expect(behavior).toBeNull();
  });

  it("allows drops into registered ordinary vertical containers", () => {
    seedDocument([{ id: "list", kind: "list" }, { id: "dragged" }]);

    expect(
      getBehaviorDropType(testWorkspace.host, "dragged", "list"),
    ).toBeNull();
  });

  it("rejects sources a registered vertical container does not accept", () => {
    seedDocument(
      [
        { id: "list", kind: "list" },
        { id: "accepted", kind: "accepted" },
        { id: "rejected", kind: "rejected" },
      ],
      (section) => section.kind === "accepted",
    );

    expect(
      getBehaviorDropType(testWorkspace.host, "accepted", "list"),
    ).toBeNull();
    expect(getBehaviorDropType(testWorkspace.host, "rejected", "list")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects drop targets that are not groups", () => {
    seedDocument([{ id: "leaf-parent" }, { id: "dragged" }]);

    expect(
      getBehaviorDropType(testWorkspace.host, "dragged", "leaf-parent"),
    ).toBe(BehaviorDropTypeEnum.INVALID);
  });

  it("rejects dropping into descendants of selected sections", () => {
    seedDocument([
      { id: "parent", kind: GROUP_SECTION_KIND, children: ["child"] },
      { id: "child", kind: GROUP_SECTION_KIND },
    ]);

    expect(getBehaviorDropType(testWorkspace.host, "parent", "child")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
  });

  it("rejects dropping a multi-selection into one of its descendants", () => {
    seedDocument([
      { id: "parent", kind: GROUP_SECTION_KIND, children: ["child"] },
      { id: "child", kind: GROUP_SECTION_KIND },
      { id: "other" },
    ]);
    testWorkspace.dndState.setState({ draggingIds: ["other", "parent"] });

    expect(getBehaviorDropType(testWorkspace.host, "other", "child")).toBe(
      BehaviorDropTypeEnum.INVALID,
    );
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
    expect(getOverId(testWorkspace.host, { id: "fallback" }, null)).toBe(
      "fallback",
    );
    expect(getOverId(testWorkspace.host, null, null)).toBeNull();
  });

  it("prefers child collision over parent based on dndChildren mapping", () => {
    updateDndChildren(testWorkspace.host, {
      parent: ["child"],
    });

    const overId = getOverId(testWorkspace.host, null, [
      collision({ id: "parent", intersectionRatio: 10 }),
      collision({ id: "child", intersectionRatio: 1 }),
    ]);

    expect(overId).toBe("child");
  });
});
