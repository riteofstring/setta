/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DragMoveEvent,
  DragStartEvent,
  SettaCollision,
} from "../dnd/adapter/types";
import { useItemDndChildren } from "../dnd/itemDndChildren";
import {
  getItemDndId,
  getTempItemDndId,
  useItemDndState,
} from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  activateItemSelect,
  useItemSelectionMode,
} from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { WorkspaceSectionItemTree } from "../document/types";
import {
  handleItemDragCancel,
  handleItemDragEnd,
  handleItemDragMove,
  handleItemDragStart,
  resetItemDragState,
} from "./itemDragHandlers";
import { registerItemListView, resetItemListViews } from "./itemListRegistry";

// Freezes the item drag lifecycle against the reference monitor: drag start snapshots the
// tree, collapses the selection to draggable roots, and replaces the dragged items with the
// temp placeholder; drag over moves the placeholder from resolved collisions; drag end maps
// the placeholder position through the visible-insertion resolution into one canonical move.

const LIST_KEY = "main";
const ACTIVE_DND_ID = getItemDndId("item-a", LIST_KEY);
const TEMP_ID = getTempItemDndId(ACTIVE_DND_ID);

function makeItemTree(
  childrenById: Record<string, Array<string>>,
  selectedItemIds: Array<string> = [],
): WorkspaceSectionItemTree {
  const ids = new Set<string>(["item-root", ...Object.keys(childrenById)]);
  for (const children of Object.values(childrenById)) {
    for (const childId of children) {
      ids.add(childId);
    }
  }
  return {
    rootId: "item-root",
    items: Object.fromEntries(
      [...ids].map((id) => [id, { id, children: childrenById[id] ?? [] }]),
    ),
    selectedItemIds,
  };
}

function loadTestDocument(selectedItemIds: Array<string> = []) {
  registerSectionKinds(testWorkspace.host, { leaf: { renderContent: () => null } });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      panel: {
        id: "panel",
        kind: "leaf",
        name: "panel",
        size: { width: 280, height: 240 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: makeItemTree(
          {
            "item-root": ["item-a", "item-group", "item-b"],
            "item-group": ["item-c", "item-d"],
          },
          selectedItemIds,
        ),
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function registerTestListView(overrides: { filterActive?: boolean } = {}) {
  registerItemListView(testWorkspace.host, "panel", {
    listKey: LIST_KEY,
    topLevelItemIds: ["item-a", "item-group", "item-b"],
    visibleItemIds: new Set([
      "item-a",
      "item-group",
      "item-b",
      "item-c",
      "item-d",
    ]),
    filterActive: overrides.filterActive ?? false,
  });
}

function makeStartEvent(itemId: string): DragStartEvent {
  return {
    active: {
      id: getItemDndId(itemId, LIST_KEY),
      data: {
        current: {
          type: "item",
          itemId,
          sectionId: "panel",
          listKey: LIST_KEY,
          isTopLevel: false,
          hasNested: false,
          onlyChildId: null,
        },
      },
    },
    activeRect: {
      top: 10,
      left: 10,
      right: 230,
      bottom: 42,
      width: 220,
      height: 32,
    },
  } as unknown as DragStartEvent;
}

function makeMoveEvent(
  collisions: Array<Partial<SettaCollision> & { id: string }>,
): DragMoveEvent {
  return {
    active: makeStartEvent("item-a").active,
    collisions: collisions.map((collision) => ({
      ...collision,
      data: {
        droppable: { data: { current: { listKey: LIST_KEY } } },
        ...(collision.data ?? {}),
      },
    })),
    over: null,
  } as unknown as DragMoveEvent;
}

async function flushItemDragOver() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function getPanelItemTree(): WorkspaceSectionItemTree {
  const itemTree = testWorkspace.document.getState().sections["panel"]?.itemTree;
  if (!itemTree) {
    throw new Error("expected the panel section to carry an item tree");
  }
  return itemTree;
}

describe("item drag lifecycle", () => {
  const changeCallback = vi.fn();

  beforeEach(() => {
    loadTestDocument();
    registerTestListView();
    activateItemSelect(testWorkspace.host);
    changeCallback.mockClear();
    testWorkspace.host.subscribe(changeCallback);
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    resetItemDragState(testWorkspace.host);
    resetItemListViews(testWorkspace.host);
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.capabilities.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.itemDndState.getState().reset();
    testWorkspace.itemDndChildren.getState().reset();
  });

  it("snapshots the tree, selects the active item, and inserts the temp placeholder on start", () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);

    const state = testWorkspace.itemDndState.getState();
    expect(state.activeId).toBe("item-a");
    expect(state.sectionId).toBe("panel");
    expect(state.listKey).toBe(LIST_KEY);
    expect(state.rootId).toBe("item-root");
    expect(state.draggingIds).toEqual(["item-a"]);
    // No manager in the test, so measurement falls back to the reference defaults and the
    // event rect.
    expect(state.placeholderWidth).toBe(220);
    expect(state.placeholderHeight).toBe(32);
    expect(state.activeRect).toEqual({
      top: 10,
      left: 10,
      right: 230,
      bottom: 42,
      width: 220,
      height: 32,
    });

    expect(getPanelItemTree().selectedItemIds).toEqual(["item-a"]);
    const children = testWorkspace.itemDndChildren.getState();
    expect(children.x["item-root"]).toEqual([TEMP_ID, "item-group", "item-b"]);
    expect(children.y[TEMP_ID]).toBe("item-root");
  });

  it("drags the shared-parent selection roots together and collapses cross-parent selections", () => {
    // A document load releases item-select mode, so each mid-test reload re-enters it.
    loadTestDocument(["item-c", "item-d"]);
    activateItemSelect(testWorkspace.host);
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-c"), null);
    expect(testWorkspace.itemDndState.getState().draggingIds).toEqual([
      "item-c",
      "item-d",
    ]);

    resetItemDragState(testWorkspace.host);
    loadTestDocument(["item-a", "item-c"]);
    activateItemSelect(testWorkspace.host);
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    // The reference's multi-parent toast stays application-side; the fallback drags only the
    // active item and collapses the selection to it.
    expect(testWorkspace.itemDndState.getState().draggingIds).toEqual(["item-a"]);
    expect(getPanelItemTree().selectedItemIds).toEqual(["item-a"]);
  });

  it("refuses to start outside item-select mode, without a visible list view, or while filtered", () => {
    testWorkspace.itemSelectionMode.getState().reset();
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    expect(testWorkspace.itemDndState.getState().activeId).toBeNull();

    activateItemSelect(testWorkspace.host);
    resetItemListViews(testWorkspace.host);
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    expect(testWorkspace.itemDndState.getState().activeId).toBeNull();

    registerTestListView({ filterActive: true });
    changeCallback.mockClear();
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    expect(testWorkspace.itemDndState.getState().activeId).toBeNull();
    // The filter abort is side-effect-free: the selection collapse never commits and the
    // host is never notified, as the reference checks its filter before anything mutates.
    expect(getPanelItemTree().selectedItemIds).toEqual([]);
    expect(changeCallback).not.toHaveBeenCalled();
  });

  it("reorders the placeholder within the parent from a past-halfway collision", async () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);

    handleItemDragMove(testWorkspace.host,
      makeMoveEvent([
        {
          id: getItemDndId("item-b", LIST_KEY),
          pastHalfway: true,
          triggerDistCondition: false,
        },
      ]),
    );
    await flushItemDragOver();

    expect(testWorkspace.itemDndChildren.getState().x["item-root"]).toEqual([
      "item-group",
      "item-b",
      TEMP_ID,
    ]);
  });

  it("ignores collisions from other lists", async () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);

    const event = {
      active: makeStartEvent("item-a").active,
      collisions: [
        {
          id: getItemDndId("item-b", LIST_KEY),
          pastHalfway: true,
          triggerDistCondition: false,
          data: { droppable: { data: { current: { listKey: "other" } } } },
        },
      ],
      over: null,
    } as unknown as DragMoveEvent;
    handleItemDragMove(testWorkspace.host, event);
    await flushItemDragOver();

    expect(testWorkspace.itemDndChildren.getState().x["item-root"]).toEqual([
      TEMP_ID,
      "item-group",
      "item-b",
    ]);
  });

  it("re-parents the placeholder into the hovered item when the trigger distance is met and commits the move", async () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    changeCallback.mockClear();

    handleItemDragMove(testWorkspace.host,
      makeMoveEvent([
        {
          id: getItemDndId("item-c", LIST_KEY),
          pastHalfway: false,
          triggerDistCondition: true,
        },
      ]),
    );
    await flushItemDragOver();

    const children = testWorkspace.itemDndChildren.getState();
    expect(children.x["item-c"]).toEqual([TEMP_ID]);
    expect(children.y[TEMP_ID]).toBe("item-c");

    handleItemDragEnd(testWorkspace.host);

    const itemTree = getPanelItemTree();
    expect(itemTree.items["item-root"]?.children).toEqual([
      "item-group",
      "item-b",
    ]);
    expect(itemTree.items["item-c"]?.children).toEqual(["item-a"]);
    expect(changeCallback).toHaveBeenCalledTimes(1);
    expect(testWorkspace.itemDndState.getState().pendingReset).toBe(true);
  });

  it("treats a drop back at the original position as a no-op", () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    changeCallback.mockClear();

    handleItemDragEnd(testWorkspace.host);

    const itemTree = getPanelItemTree();
    expect(itemTree.items["item-root"]?.children).toEqual([
      "item-a",
      "item-group",
      "item-b",
    ]);
    expect(changeCallback).not.toHaveBeenCalled();
    expect(testWorkspace.itemDndState.getState().pendingReset).toBe(true);
  });

  it("defers the reset on cancel", () => {
    handleItemDragStart(testWorkspace.host, makeStartEvent("item-a"), null);
    handleItemDragCancel(testWorkspace.host);
    expect(testWorkspace.itemDndState.getState().pendingReset).toBe(true);

    resetItemDragState(testWorkspace.host);
    expect(testWorkspace.itemDndState.getState().activeId).toBeNull();
    expect(testWorkspace.itemDndChildren.getState().x).toEqual({});
  });
});
