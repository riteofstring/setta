import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveSectionIds } from "../document/activeSections.js";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback.js";
import { insertWorkspaceSection } from "../document/insertWorkspaceSection.js";
import { setSelectedItems } from "../document/itemSelection.js";
import { commitWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { setItemData } from "../document/itemData.js";
import { setItemValue } from "../document/itemPresentationMutations.js";
import { moveSections } from "../document/moveSections.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import { setSectionData } from "../document/sectionData.js";
import { deleteSection, setSectionName } from "../document/sectionMutations.js";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import { persistSectionSizeChange } from "../section/sectionSizes.js";
import type {
  WorkspaceDocument,
  WorkspaceItem,
  WorkspaceSection,
} from "../document/types.js";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import {
  beginWorkspaceHistoryBatch,
  cancelWorkspaceHistoryBatch,
  completeWorkspaceHistoryBatch,
  getWorkspaceHistoryState,
  recordWorkspaceHistoryEntry,
  redoWorkspace,
  subscribeWorkspaceHistory,
  undoWorkspace,
} from "./workspaceHistory.js";
import type {
  WorkspaceHistoryAuthority,
  WorkspaceHistoryState,
  WorkspaceHistorySynchronization,
  WorkspaceHistoryTransaction,
} from "./workspaceHistoryTypes.js";

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 80, width: 160 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function makeControlItem(id: string): WorkspaceItem {
  return {
    children: [],
    id,
    presentation: {
      control: {
        configuration: {
          autocomplete: "off",
          disabled: false,
          placeholder: null,
          singleLine: true,
          wrapLines: true,
        },
        kind: "text",
        value: "before",
      },
      label: "Control",
      labelEditable: true,
    },
  };
}

function makeDocument(
  overrides: Partial<WorkspaceDocument> = {},
): WorkspaceDocument {
  return {
    activeIds: ["a"],
    sections: {
      a: makeSection("a"),
      b: makeSection("b", {
        itemTree: {
          items: {
            control: makeControlItem("control"),
            data: { children: [], data: { value: "before" }, id: "data" },
            root: { children: ["data", "control"], id: "root" },
          },
          rootId: "root",
          selectedItemIds: ["data"],
        },
      }),
    },
    topLevelSections: {
      a: { h: 80, w: 160, x: 0, y: 0, zIndex: 0 },
      b: { h: 80, w: 160, x: 240, y: 0, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    savedViews: null,
    ...overrides,
  };
}

function createLoadedLocalHost(limit?: number): WorkspaceHost {
  const host = createWorkspaceHost({
    history: { kind: "local", ...(limit === undefined ? {} : { limit }) },
  });
  registerSectionKinds(host, {
    leaf: {
      itemArea: { toolbar: "authoring-and-filter" },
      renderContent: () => null,
    },
  });
  host.loadDocument(makeDocument());
  return host;
}

const hosts: Array<WorkspaceHost> = [];

function ownHost(host: WorkspaceHost): WorkspaceHost {
  hosts.push(host);
  return host;
}

function requireValue<Value>(
  value: Value | null | undefined,
  message: string,
): Value {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function publishDelegatedState(
  listeners: ReadonlySet<(state: WorkspaceHistoryState) => void>,
  state: WorkspaceHistoryState,
): void {
  for (const listener of listeners) {
    listener(state);
  }
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
});

describe("local Workspace history", () => {
  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects invalid local limit %s",
    (limit) => {
      expect(() =>
        createWorkspaceHost({ history: { kind: "local", limit } }),
      ).toThrow(/positive finite integer/u);
    },
  );

  it("records, undoes, redoes, invalidates redo, and evicts entries at its limit", () => {
    const host = ownHost(createLoadedLocalHost(1));

    setSectionName(host, "a", "First");
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: false,
      canUndo: true,
    });
    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["a"]?.name).toBe("a");
    expect(redoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["a"]?.name).toBe("First");

    setSectionName(host, "a", "Second");
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: false,
      canUndo: true,
    });
    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["a"]?.name).toBe("First");
    expect(undoWorkspace(host)).toBe(false);
  });

  it("preserves the live viewport and restores the recorded section selection", () => {
    const host = ownHost(createLoadedLocalHost());
    setSectionName(host, "a", "Renamed");
    getWorkspaceDocumentStore(host).setState({
      viewport: { x: 80, y: 40, zoom: 2 },
    });
    notifyWorkspaceDocumentChange(host, null);
    setActiveSectionIds(host, ["b"]);

    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().viewport).toEqual({ x: 80, y: 40, zoom: 2 });
    expect(host.getSnapshot().activeIds).toEqual(["a"]);
  });

  it("gates navigation on current capabilities and updates history subscribers", () => {
    const host = ownHost(createLoadedLocalHost());
    const states: Array<WorkspaceHistoryState> = [];
    const unsubscribe = subscribeWorkspaceHistory(host, (state) => {
      states.push(state);
    });
    setSectionName(host, "a", "Renamed");
    getWorkspaceCapabilitiesStore(host).setState({ canEditLayout: false });

    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canUndo: false,
      undoDisabledReason: "Undo requires permission to edit workspace layout.",
    });
    expect(undoWorkspace(host)).toBe(false);
    getWorkspaceCapabilitiesStore(host).setState({ canEditLayout: true });
    expect(undoWorkspace(host)).toBe(true);
    expect(states).toHaveLength(4);
    unsubscribe();
  });

  it("clears local history for external loads and application projections", () => {
    const host = ownHost(createLoadedLocalHost());
    setSectionName(host, "a", "Renamed");
    host.loadDocument(makeDocument());
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: false,
      canUndo: false,
    });

    setSectionName(host, "a", "Renamed again");
    commitWorkspaceDocument(host, host.getSnapshot());
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: false,
      canUndo: false,
    });
  });

  it("records one completed batch and rejects nested or mismatched batches", () => {
    const host = ownHost(createLoadedLocalHost());
    const batch = beginWorkspaceHistoryBatch(host, "section-resize");
    setSectionName(host, "a", "Intermediate");
    setSectionName(host, "a", "Final");
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: false,
      canUndo: false,
      undoDisabledReason:
        "Undo is unavailable while a workspace edit is in progress.",
    });
    expect(undoWorkspace(host)).toBe(false);
    expect(() => beginWorkspaceHistoryBatch(host, "section-resize")).toThrow(
      /already active/u,
    );
    completeWorkspaceHistoryBatch(host, batch);

    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["a"]?.name).toBe("a");

    const next = beginWorkspaceHistoryBatch(host, "section-resize");
    expect(() => completeWorkspaceHistoryBatch(host, {} as never)).toThrow(
      /does not belong/u,
    );
    cancelWorkspaceHistoryBatch(host, next);
  });

  it("keeps later excluded section and item fields during structural replay", () => {
    const host = ownHost(createLoadedLocalHost());
    moveSections(host, {
      newIndex: null,
      newParentId: null,
      positionsById: { a: { x: 100, y: 0 } },
      sectionIds: ["a"],
    });
    setSectionData(host, "b", { value: "section after move" });
    setItemData(host, "b", "data", { value: "item after move" });
    setItemValue(host, "b", "control", "control after move");
    setSelectedItems(host, "b", ["control"]);
    persistSectionSizeChange(host, "a", { width: 220 }, null);

    expect(undoWorkspace(host)).toBe(true);
    const snapshot = host.getSnapshot();
    const section = requireValue(
      snapshot.sections["b"],
      "Expected section b after replay.",
    );
    const itemTree = requireValue(
      section.itemTree,
      "Expected section b to retain its item tree.",
    );
    const dataItem = requireValue(
      itemTree.items["data"],
      "Expected the data item after replay.",
    );
    const controlItem = requireValue(
      itemTree.items["control"],
      "Expected the control item after replay.",
    );
    const controlPresentation = requireValue(
      controlItem.presentation,
      "Expected the control presentation after replay.",
    );
    const topLevelLayout = requireValue(
      snapshot.topLevelSections["a"],
      "Expected section a to remain top-level after replay.",
    );
    const movedSection = requireValue(
      snapshot.sections["a"],
      "Expected section a after replay.",
    );
    expect(section.data).toEqual({ value: "section after move" });
    expect(dataItem.data).toEqual({
      value: "item after move",
    });
    expect(controlPresentation.control).toMatchObject({
      value: "control after move",
    });
    expect(itemTree.selectedItemIds).toEqual(["data"]);
    expect(movedSection.size.width).toBe(220);
    expect(topLevelLayout.x).toBe(0);
  });

  it("refreshes transaction source snapshots around unrecorded create and delete edits", () => {
    const createHost = ownHost(createLoadedLocalHost());
    insertWorkspaceSection(createHost, makeSection("created"), {
      x: 480,
      y: 0,
    });
    setSectionData(createHost, "created", { value: "after create" });
    expect(undoWorkspace(createHost)).toBe(true);
    expect(createHost.getSnapshot().sections["created"]).toBeUndefined();
    expect(redoWorkspace(createHost)).toBe(true);
    expect(createHost.getSnapshot().sections["created"]?.data).toEqual({
      value: "after create",
    });

    const deleteHost = ownHost(createLoadedLocalHost());
    deleteSection(deleteHost, "b");
    expect(undoWorkspace(deleteHost)).toBe(true);
    setSectionData(deleteHost, "b", { value: "after restore" });
    expect(redoWorkspace(deleteHost)).toBe(true);
    expect(deleteHost.getSnapshot().sections["b"]).toBeUndefined();
    expect(undoWorkspace(deleteHost)).toBe(true);
    expect(deleteHost.getSnapshot().sections["b"]?.data).toEqual({
      value: "after restore",
    });
  });

  it("retains the stack transition when a document subscriber throws after replay publication", () => {
    const host = ownHost(createLoadedLocalHost());
    setSectionName(host, "a", "Renamed");
    const unsubscribe = host.subscribe(() => {
      throw new Error("subscriber failure");
    });

    expect(() => undoWorkspace(host)).toThrow(/subscriber failure/u);
    expect(host.getSnapshot().sections["a"]?.name).toBe("a");
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: true,
      canUndo: false,
    });
    unsubscribe();
    expect(redoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["a"]?.name).toBe("Renamed");
  });
});

describe("host-owned Workspace history entries", () => {
  function recordCable(host: WorkspaceHost, cables: Set<string>, id: string) {
    cables.add(id);
    recordWorkspaceHistoryEntry(host, {
      redo: () => cables.add(id),
      undo: () => cables.delete(id),
    });
  }

  function moveA(host: WorkspaceHost, x: number) {
    moveSections(host, {
      newIndex: null,
      newParentId: null,
      positionsById: { a: { x, y: 0 } },
      sectionIds: ["a"],
    });
  }

  it("interleaves host entries with structural edits in one stack", () => {
    const host = ownHost(createLoadedLocalHost());
    const cables = new Set<string>();
    moveA(host, 100);
    recordCable(host, cables, "drift-filter");
    moveA(host, 200);

    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().topLevelSections["a"]?.x).toBe(100);
    expect(cables.has("drift-filter")).toBe(true);
    expect(undoWorkspace(host)).toBe(true);
    expect(cables.has("drift-filter")).toBe(false);
    expect(host.getSnapshot().topLevelSections["a"]?.x).toBe(100);
    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().topLevelSections["a"]?.x).toBe(0);

    expect(redoWorkspace(host)).toBe(true);
    expect(redoWorkspace(host)).toBe(true);
    expect(cables.has("drift-filter")).toBe(true);
    expect(host.getSnapshot().topLevelSections["a"]?.x).toBe(100);

    recordCable(host, cables, "filter-amp");
    expect(getWorkspaceHistoryState(host).canRedo).toBe(false);
    expect(undoWorkspace(host)).toBe(true);
    expect(cables).toEqual(new Set(["drift-filter"]));
  });

  it("obeys the limit and is cleared by loads and projections", () => {
    const host = ownHost(createLoadedLocalHost(2));
    const cables = new Set<string>();
    recordCable(host, cables, "first");
    recordCable(host, cables, "second");
    recordCable(host, cables, "third");
    expect(undoWorkspace(host)).toBe(true);
    expect(undoWorkspace(host)).toBe(true);
    expect(undoWorkspace(host)).toBe(false);
    expect(cables).toEqual(new Set(["first"]));

    recordCable(host, cables, "loaded");
    host.loadDocument(makeDocument());
    expect(getWorkspaceHistoryState(host).canUndo).toBe(false);
    recordCable(host, cables, "projected");
    commitWorkspaceDocument(host, host.getSnapshot());
    expect(undoWorkspace(host)).toBe(false);
    expect(cables.has("projected")).toBe(true);
  });

  it("keeps a failed host entry in place and rejects recording during replay", () => {
    const host = ownHost(createLoadedLocalHost());
    const undo = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Cable store is offline.");
      })
      .mockImplementationOnce(() =>
        recordWorkspaceHistoryEntry(host, { redo: vi.fn(), undo: vi.fn() }),
      );
    recordWorkspaceHistoryEntry(host, { redo: vi.fn(), undo });

    expect(() => undoWorkspace(host)).toThrow(/offline/u);
    expect(getWorkspaceHistoryState(host).canUndo).toBe(true);
    expect(() => undoWorkspace(host)).toThrow(/during undo or redo/u);
    expect(() =>
      recordWorkspaceHistoryEntry(host, { redo: vi.fn() } as never),
    ).toThrow(/require undo\(\) and redo\(\)/u);
  });

  it("fails loudly without local history", () => {
    const entry = { redo: vi.fn(), undo: vi.fn() };
    const authority: WorkspaceHistoryAuthority = {
      getState: () => ({ canRedo: false, canUndo: false }),
      record: vi.fn(),
      redo: vi.fn(),
      subscribe: () => () => undefined,
      synchronize: vi.fn(),
      undo: vi.fn(),
    };
    const delegated = ownHost(
      createWorkspaceHost({ history: { authority, kind: "delegated" } }),
    );
    const disabled = ownHost(createWorkspaceHost());

    expect(() => recordWorkspaceHistoryEntry(delegated, entry)).toThrow(
      /require local workspace history/u,
    );
    expect(() => recordWorkspaceHistoryEntry(disabled, entry)).toThrow(
      /require local workspace history/u,
    );
    expect(authority.record).not.toHaveBeenCalled();
  });
});

describe("delegated Workspace history", () => {
  it("forwards frozen detached transactions, synchronizations, state, navigation, and disposal", () => {
    const transactions: Array<WorkspaceHistoryTransaction> = [];
    const synchronizations: Array<WorkspaceHistorySynchronization> = [];
    const listeners = new Set<(state: WorkspaceHistoryState) => void>();
    const dispose = vi.fn();
    let state: WorkspaceHistoryState = { canRedo: false, canUndo: false };
    const authority: WorkspaceHistoryAuthority = {
      dispose,
      getState: () => state,
      record: (transaction) => transactions.push(transaction),
      redo: vi.fn(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      synchronize: (event) => synchronizations.push(event),
      undo: vi.fn(),
    };
    const host = ownHost(
      createWorkspaceHost({ history: { authority, kind: "delegated" } }),
    );
    registerSectionKinds(host, {
      leaf: {
        itemArea: { toolbar: "authoring-and-filter" },
        renderContent: () => null,
      },
    });
    host.loadDocument(makeDocument());
    setSectionName(host, "a", "Renamed");

    const transaction = requireValue(
      transactions[0],
      "Expected a delegated history transaction.",
    );
    const beforeSection = requireValue(
      transaction.before.sections["a"],
      "Expected section a in the before snapshot.",
    );
    const afterSection = requireValue(
      transaction.after.sections["a"],
      "Expected section a in the after snapshot.",
    );
    const loadSynchronization = requireValue(
      synchronizations[0],
      "Expected a load synchronization.",
    );
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.before)).toBe(true);
    expect(Object.isFrozen(transaction.before.sections)).toBe(true);
    expect(beforeSection.name).toBe("a");
    expect(afterSection.name).toBe("Renamed");
    expect(synchronizations).toHaveLength(1);
    expect(loadSynchronization.source).toBe("load");
    expect(Object.isFrozen(loadSynchronization.document)).toBe(true);

    state = {
      canRedo: false,
      canUndo: false,
      redoDisabledReason: " ",
      undoDisabledReason: " Delegated undo is pending. ",
    };
    publishDelegatedState(listeners, state);
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      redoDisabledReason:
        "Redo is unavailable from the delegated history authority.",
      undoDisabledReason: "Delegated undo is pending.",
    });

    state = { canRedo: true, canUndo: true };
    publishDelegatedState(listeners, state);
    expect(getWorkspaceHistoryState(host)).toMatchObject({
      canRedo: true,
      canUndo: true,
    });
    expect(undoWorkspace(host)).toBe(true);
    expect(redoWorkspace(host)).toBe(true);
    expect(authority.undo).toHaveBeenCalledOnce();
    expect(authority.redo).toHaveBeenCalledOnce();

    commitWorkspaceDocument(host, host.getSnapshot());
    expect(
      requireValue(
        synchronizations.at(-1),
        "Expected a projection synchronization.",
      ).source,
    ).toBe("projection");
    host.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("requires delegated subscriptions to return an unsubscribe function", () => {
    const authority = {
      getState: () => ({ canRedo: false, canUndo: false }),
      record: () => undefined,
      redo: () => undefined,
      subscribe: () => null,
      synchronize: () => undefined,
      undo: () => undefined,
    } as unknown as WorkspaceHistoryAuthority;

    expect(() =>
      createWorkspaceHost({ history: { authority, kind: "delegated" } }),
    ).toThrow(/must return an unsubscribe function/u);
  });
});
