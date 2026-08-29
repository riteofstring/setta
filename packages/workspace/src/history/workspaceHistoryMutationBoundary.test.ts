import { afterEach, describe, expect, it } from "vitest";
import { startCanvasViewportDocumentSync } from "../canvas/documentViewportSync";
import { commitTopLevelLayoutToDocument } from "../canvas/nodeInternalsActions";
import { getReactFlowStore } from "../canvas/store";
import { setActiveSectionIds } from "../document/activeSections";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection";
import { setItemColumnWidth } from "../document/itemColumnWidth";
import { setItemData } from "../document/itemData";
import {
  setItemControlConfiguration,
  setItemLabel,
  setItemValue,
} from "../document/itemPresentationMutations";
import { setSelectedItems } from "../document/itemSelection";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { moveItems } from "../document/moveItems";
import { moveSections } from "../document/moveSections";
import { setSectionData } from "../document/sectionData";
import {
  deleteSection,
  groupSections,
  setSectionName,
  setSectionStyleColor,
  setSectionsPositionLocked,
  toggleGroupOrientation,
  toggleMinimized,
} from "../document/sectionMutations";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { getNodeInternalsStore } from "../document/stores";
import type {
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import {
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "../items/itemAuthoringActions";
import { setGroupOverflowMode } from "../section/groupOverflowAction";
import { setWorkspaceSectionSize } from "../section/sectionSizes";
import { setSectionTagColor } from "../section/tagColorAction";
import { ungroupSections } from "../section/ungroupAction";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import type {
  WorkspaceHistoryAuthority,
  WorkspaceHistoryState,
  WorkspaceHistoryTransaction,
} from "./workspaceHistoryTypes";

type HistoryWorkspace = {
  host: WorkspaceHost;
  transactions: Array<WorkspaceHistoryTransaction>;
};

let workspace: HistoryWorkspace | null = null;

afterEach(() => {
  workspace?.host.dispose();
  workspace = null;
});

function createSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    id,
    kind: "leaf",
    name: id,
    size: { width: 240, height: 120 },
    overflowMode: false,
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  };
}

function createHistoryAuthority(
  transactions: Array<WorkspaceHistoryTransaction>,
): WorkspaceHistoryAuthority {
  const state: WorkspaceHistoryState = { canRedo: false, canUndo: false };
  return {
    getState: () => state,
    record: (transaction) => transactions.push(transaction),
    redo: () => undefined,
    subscribe: () => () => undefined,
    synchronize: () => undefined,
    undo: () => undefined,
  };
}

function createHistoryWorkspace(): HistoryWorkspace {
  const transactions: Array<WorkspaceHistoryTransaction> = [];
  const host = createWorkspaceHost({
    history: {
      authority: createHistoryAuthority(transactions),
      kind: "delegated",
    },
  });
  registerSectionKinds(host, {
    items: {
      createItem: () => ({
        children: [],
        data: { value: "created" },
        id: "created-item",
      }),
      itemArea: { toolbar: "authoring-and-filter" },
      renderContent: () => null,
    },
    leaf: { renderContent: () => null },
  });
  loadWorkspaceDocument(host, createDocument());
  return { host, transactions };
}

function createDocument(): WorkspaceDocumentInput {
  return {
    activeIds: [],
    sections: {
      alpha: createSection("alpha", { data: { value: "alpha" } }),
      bravo: createSection("bravo"),
      delta: createSection("delta"),
      group: createSection("group", {
        children: ["nested"],
        kind: "group",
        overflowMode: true,
      }),
      items: createSection("items", {
        itemTree: {
          items: {
            built: {
              children: [],
              id: "built",
              presentation: {
                control: {
                  configuration: {
                    autocomplete: "off",
                    disabled: false,
                    placeholder: null,
                    singleLine: true,
                    wrapLines: false,
                  },
                  kind: "text",
                  value: "initial",
                },
                label: "Built",
                labelEditable: true,
              },
            },
            custom: {
              children: [],
              data: { value: "custom" },
              id: "custom",
            },
            "item-root": {
              children: ["custom", "built", "move-a", "move-b"],
              id: "item-root",
            },
            "move-a": { children: [], id: "move-a" },
            "move-b": { children: [], id: "move-b" },
          },
          rootId: "item-root",
          selectedItemIds: [],
        },
        kind: "items",
      }),
      nested: createSection("nested"),
    },
    topLevelSections: {
      alpha: { h: 120, w: 240, x: 0, y: 0, zIndex: 0 },
      bravo: { h: 120, w: 240, x: 260, y: 0, zIndex: 1 },
      delta: { h: 120, w: 240, x: 520, y: 0, zIndex: 2 },
      group: { h: 120, w: 240, x: 0, y: 180, zIndex: 3 },
      items: { h: 120, w: 240, x: 260, y: 180, zIndex: 4 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function expectOneTransaction(
  historyWorkspace: HistoryWorkspace,
  kind: WorkspaceHistoryTransaction["kind"],
  action: () => void,
): void {
  const count = historyWorkspace.transactions.length;
  action();
  expect(historyWorkspace.transactions).toHaveLength(count + 1);
  expect(historyWorkspace.transactions.at(-1)?.kind).toBe(kind);
}

describe("workspace history mutation boundaries", () => {
  it("records every section mutation family once with its exact kind", () => {
    const historyWorkspace = createHistoryWorkspace();
    workspace = historyWorkspace;

    expectOneTransaction(historyWorkspace, "section-create", () =>
      insertWorkspaceSection(historyWorkspace.host, createSection("created"), {
        x: 780,
        y: 0,
      }),
    );
    expectOneTransaction(historyWorkspace, "section-delete", () =>
      deleteSection(historyWorkspace.host, "delta"),
    );
    expectOneTransaction(historyWorkspace, "section-move", () =>
      moveSections(historyWorkspace.host, {
        newIndex: null,
        newParentId: null,
        positionsById: { created: { x: 810, y: 20 } },
        sectionIds: ["created"],
      }),
    );
    expectOneTransaction(historyWorkspace, "section-resize", () =>
      setWorkspaceSectionSize(historyWorkspace.host, "alpha", { width: 300 }),
    );
    expectOneTransaction(historyWorkspace, "section-layout", () =>
      setSectionsPositionLocked(historyWorkspace.host, ["items"], true),
    );
    expectOneTransaction(historyWorkspace, "section-layout", () =>
      toggleGroupOrientation(historyWorkspace.host, "group"),
    );
    expectOneTransaction(historyWorkspace, "section-layout", () =>
      setGroupOverflowMode(historyWorkspace.host, "group", false),
    );
    expectOneTransaction(historyWorkspace, "section-presentation", () =>
      setSectionName(historyWorkspace.host, "alpha", "Renamed"),
    );
    expectOneTransaction(historyWorkspace, "section-presentation", () =>
      toggleMinimized(historyWorkspace.host, "alpha"),
    );
    expectOneTransaction(historyWorkspace, "section-presentation", () =>
      setSectionStyleColor(historyWorkspace.host, "alpha", "abcdef"),
    );
    expectOneTransaction(historyWorkspace, "section-presentation", () =>
      setSectionTagColor(historyWorkspace.host, "alpha", "a1b2c3"),
    );
    expectOneTransaction(historyWorkspace, "section-group", () =>
      groupSections(historyWorkspace.host, ["bravo", "created"], "new-group"),
    );
    expectOneTransaction(historyWorkspace, "section-ungroup", () =>
      ungroupSections(historyWorkspace.host, ["group"]),
    );
  });

  it("records every item mutation family once with its exact kind", () => {
    const historyWorkspace = createHistoryWorkspace();
    workspace = historyWorkspace;

    expectOneTransaction(historyWorkspace, "item-create", () =>
      insertWorkspaceItem(historyWorkspace.host, "items"),
    );
    expectOneTransaction(historyWorkspace, "item-delete", () =>
      deleteWorkspaceItems(historyWorkspace.host, "items", ["custom"]),
    );
    expectOneTransaction(historyWorkspace, "item-move", () =>
      moveItems(historyWorkspace.host, {
        itemIds: ["move-b"],
        newIndex: 1,
        newParentId: "item-root",
        sectionId: "items",
      }),
    );
    expectOneTransaction(historyWorkspace, "item-layout", () =>
      setItemColumnWidth(historyWorkspace.host, "items", 3),
    );
  });

  it("does not record transient, data, or item-presentation publications", () => {
    const historyWorkspace = createHistoryWorkspace();
    workspace = historyWorkspace;
    const { host, transactions } = historyWorkspace;

    setActiveSectionIds(host, ["alpha"]);
    setSelectedItems(host, "items", ["custom"]);
    setSectionData(host, "alpha", { value: "next" });
    setItemData(host, "items", "custom", { value: "next" });
    setItemLabel(host, "items", "built", "Renamed item");
    setItemValue(host, "items", "built", "next value");
    setItemControlConfiguration(host, "items", "built", {
      configuration: {
        autocomplete: "off",
        disabled: true,
        placeholder: "Updated",
        singleLine: true,
        wrapLines: false,
      },
      kind: "text",
    });

    const nodeStore = getNodeInternalsStore(host);
    const nodes = new Map(nodeStore.getState().x);
    const alpha = nodes.get("alpha");
    if (!alpha) {
      throw new Error(
        "Expected the alpha node after loading the test document.",
      );
    }
    nodes.set("alpha", { ...alpha, position: { x: 36, y: 48 } });
    nodeStore.setState({ x: nodes });
    commitTopLevelLayoutToDocument(host, null);

    const stopViewportSync = startCanvasViewportDocumentSync(host);
    try {
      getReactFlowStore(host).setState({ transform: [12, 24, 1.25] });
    } finally {
      stopViewportSync();
    }

    expect(transactions).toEqual([]);
  });
});
