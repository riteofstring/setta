/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setItemDndState, useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  getWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
} from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import type { WorkspaceItemFactoryContext } from "../document/sectionKindRegistry";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSectionItemTree } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import {
  deleteSelectedWorkspaceItems,
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "./itemAuthoringActions";

function loadItemDocument(): void {
  loadWorkspaceDocument({
    sections: {
      panel: {
        id: "panel",
        kind: "items",
        name: "Panel",
        size: { width: 260, height: 180 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "root",
          items: {
            root: { id: "root", children: ["alpha", "beta"] },
            alpha: { id: "alpha", children: [], data: { value: "a" } },
            beta: { id: "beta", children: [], data: { value: "b" } },
          },
          selectedItemIds: ["alpha"],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function getPanelItemTree(): WorkspaceSectionItemTree {
  const itemTree = useWorkspaceDocument.getState().sections.panel?.itemTree;
  if (!itemTree) {
    throw new Error("Expected the panel item tree.");
  }
  return itemTree;
}

function getRequiredFactoryContext(
  context: WorkspaceItemFactoryContext | null,
): WorkspaceItemFactoryContext & {
  section: WorkspaceItemFactoryContext["section"] & { itemTree: WorkspaceSectionItemTree };
} {
  if (!context || !context.section.itemTree) {
    throw new Error("Expected the host item factory context.");
  }
  return context as WorkspaceItemFactoryContext & {
    section: WorkspaceItemFactoryContext["section"] & { itemTree: WorkspaceSectionItemTree };
  };
}

describe("item authoring actions", () => {
  let factoryContext: WorkspaceItemFactoryContext | null;
  let factoryItem: { id: string; children: Array<string>; data: { value: string } };

  beforeEach(() => {
    factoryContext = null;
    factoryItem = { id: "created", children: [], data: { value: "host default" } };
    registerSectionKinds({
      items: {
        renderContent: () => null,
        createItem: (context) => {
          factoryContext = context;
          return factoryItem;
        },
      },
    });
    loadItemDocument();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceCapabilities.getState().reset();
    useItemDndState.getState().reset();
    useSectionRefs.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls the frozen host factory and atomically reports one selected insertion", () => {
    const notifications: Array<ReturnType<typeof getWorkspaceDocument>> = [];
    setWorkspaceDocumentChangeCallback((document) => notifications.push(document));

    const inserted = insertWorkspaceItem("panel");

    expect(inserted).toEqual(factoryItem);
    expect(inserted).not.toBe(factoryItem);
    const context = getRequiredFactoryContext(factoryContext);
    expect(context.section.id).toBe("panel");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.section)).toBe(true);
    expect(Object.isFrozen(context.section.itemTree)).toBe(true);
    expect(getPanelItemTree()).toMatchObject({
      selectedItemIds: ["created"],
      items: { root: { children: ["alpha", "beta", "created"] } },
    });
    expect(useActiveSections.getState().activeIds).toEqual(["panel"]);
    expect(notifications).toHaveLength(1);
    const notification = notifications[0];
    if (!notification) {
      throw new Error("Expected one document notification.");
    }
    expect(notification.activeIds).toEqual(["panel"]);
    expect(notification.sections.panel?.itemTree?.selectedItemIds).toEqual(["created"]);

    factoryItem.data.value = "mutated";
    const insertedData = inserted.data;
    if (insertedData && typeof insertedData === "object" && !Array.isArray(insertedData)) {
      insertedData["value"] = "also mutated";
    }
    expect(getPanelItemTree().items.created?.data).toEqual({
      value: "host default",
    });
  });

  it("rejects capability and drag gates before invoking the factory or writing", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    const before = getWorkspaceDocument();

    useWorkspaceCapabilities.setState({ canEditStructure: false });
    expect(() => insertWorkspaceItem("panel")).toThrow("requires permission");
    expect(factoryContext).toBeNull();

    useWorkspaceCapabilities.setState({ canEditStructure: true });
    setItemDndState({ activeId: "alpha" });
    expect(() => insertWorkspaceItem("panel")).toThrow("item drag is active");
    expect(factoryContext).toBeNull();
    expect(getWorkspaceDocument()).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("validates all deletion ids before one write and one notification", () => {
    const onChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onChange);
    const before = structuredClone(getWorkspaceDocument());

    expect(() => deleteWorkspaceItems("panel", ["alpha", "missing"])).toThrow(
      "unknown item missing",
    );
    expect(getWorkspaceDocument()).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();

    expect(deleteSelectedWorkspaceItems("panel")).toEqual(["alpha"]);
    expect(getPanelItemTree().selectedItemIds).toEqual(["beta"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("restores focus to the selected survivor when a package section surface owned focus", () => {
    const section = document.createElement("div");
    section.tabIndex = -1;
    const deleteButton = document.createElement("button");
    const betaRow = document.createElement("div");
    betaRow.tabIndex = -1;
    betaRow.dataset["workspaceItemId"] = "beta";
    const focus = vi.spyOn(betaRow, "focus");
    section.append(deleteButton, betaRow);
    document.body.append(section);
    useSectionRefs.setState({ selfOnly: { panel: section }, withNested: {} });
    deleteButton.focus();

    deleteSelectedWorkspaceItems("panel");

    expect(document.activeElement).toBe(betaRow);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    section.remove();
  });
});
