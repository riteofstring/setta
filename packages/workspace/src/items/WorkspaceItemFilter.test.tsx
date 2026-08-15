/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DragStartEvent } from "../dnd/adapter/types";
import { useItemDndChildren } from "../dnd/itemDndChildren";
import { ItemDndContext } from "../dnd/ItemDndContext";
import { getItemDndId, useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { activateItemSelect, useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import {
  registerSectionKinds,
  type WorkspaceItemSearchContext,
} from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "../document/types";
import { handleItemDragStart, resetItemDragState } from "./itemDragHandlers";
import type { ItemRowRenderContext } from "./ItemListContext";
import { resetItemListViews, resolveItemListView } from "./itemListRegistry";
import { moveSelectedItemsDown } from "./selectedItemMoves";
import { WorkspaceItemAuthoringToolbar } from "./WorkspaceItemAuthoringToolbar";
import { WorkspaceItemFilterProvider } from "./WorkspaceItemFilterContext";
import { WorkspaceItemList } from "./WorkspaceItemList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

const LIST_KEY = "main";

function makeGroupItem(id: string, label: string, children: Array<string> = []): WorkspaceItem {
  return { id, children, presentation: { label, control: { kind: "group" } } };
}

function makeItemTree(selectedItemIds: Array<string> = []): WorkspaceSectionItemTree {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: ["alpha", "options", "beta"] },
      alpha: makeGroupItem("alpha", "Learning rate"),
      options: makeGroupItem("options", "Options", ["momentum"]),
      momentum: {
        id: "momentum",
        children: [],
        data: { label: "Momentum editor", searchableText: "optimizer momentum" },
      },
      beta: {
        id: "beta",
        children: [],
        data: { label: "Worker editor", searchableText: "beta worker count" },
      },
    },
    selectedItemIds,
  };
}

function getCustomItemText(
  item: WorkspaceItemSearchContext["item"],
  field: "label" | "searchableText",
): string {
  const data = item.data;
  const value =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Readonly<Record<string, unknown>>)[field]
      : null;
  if (typeof value !== "string") {
    throw new Error(`Custom item ${item.id} is missing ${field}.`);
  }
  return value;
}

function registerTestKind() {
  registerSectionKinds({
    parameters: {
      renderContent: () => null,
      getItemSearchableText: ({ item }) => getCustomItemText(item, "searchableText"),
    },
  });
}

function loadTestDocument(selectedItemIds: Array<string> = []) {
  registerTestKind();
  loadWorkspaceDocument({
    sections: {
      panel: {
        id: "panel",
        kind: "parameters",
        name: "Parameters",
        size: { width: 320, height: 240 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: makeItemTree(selectedItemIds),
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 320, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: ["panel"],
  });
}

function renderCustomItem(context: ItemRowRenderContext) {
  return createElement("input", {
    "aria-label": getCustomItemText(context.item, "label"),
    defaultValue: context.item.id,
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
    activeRect: { top: 0, left: 0, right: 200, bottom: 24, width: 200, height: 24 },
  } as unknown as DragStartEvent;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!valueSetter) {
    throw new Error("The native input value setter is unavailable.");
  }
  valueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("WorkspaceItemFilter", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onDocumentChange = vi.fn();

  beforeEach(() => {
    loadTestDocument();
    host = document.createElement("div");
    host.dataset["sectionId"] = "panel";
    document.body.appendChild(host);
    root = createRoot(host);
    onDocumentChange.mockClear();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    resetItemDragState();
    resetItemListViews();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useWorkspaceCapabilities.getState().reset();
    useItemSelectionMode.getState().reset();
    useItemDndState.getState().reset();
    useItemDndChildren.getState().reset();
  });

  async function mount(): Promise<HTMLInputElement> {
    const itemTree = useWorkspaceDocument.getState().sections.panel?.itemTree;
    if (!itemTree) {
      throw new Error("The test panel lost its item tree.");
    }
    await act(async () => {
      root.render(
        <WorkspaceItemFilterProvider sectionId="panel">
          <WorkspaceItemAuthoringToolbar sectionId="panel" />
          <ItemDndContext>
            <WorkspaceItemList
              sectionId="panel"
              listKey={LIST_KEY}
              topLevelItemIds={itemTree.items[itemTree.rootId]?.children ?? []}
              renderItem={renderCustomItem}
            />
          </ItemDndContext>
        </WorkspaceItemFilterProvider>,
      );
    });
    const input = host.querySelector<HTMLInputElement>("#panel-parameter-filter");
    if (!input) {
      throw new Error("The parameter filter input did not render.");
    }
    return input;
  }

  it("keeps filtering ephemeral, explains hidden selection, and gates structural movement", async () => {
    loadTestDocument(["alpha"]);
    activateItemSelect();
    const input = await mount();
    const documentBeforeFilter = structuredClone(useWorkspaceDocument.getState().sections);

    await act(async () => setInputValue(input, "momentum"));

    expect(host.querySelector('[data-workspace-item-id="alpha"]')).toBeNull();
    expect(host.querySelector('[data-workspace-item-id="options"]')).not.toBeNull();
    expect(host.querySelector('[data-workspace-item-id="momentum"]')).not.toBeNull();
    expect(host.textContent).toContain("1 selected parameter is hidden by this filter.");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "1 matching parameter. 1 selected parameter is hidden by this filter.",
    );
    expect(resolveItemListView("panel", "momentum", LIST_KEY)?.filterActive).toBe(true);

    expect(moveSelectedItemsDown()).toBe(false);
    handleItemDragStart(makeStartEvent("momentum"), null);
    expect(useItemDndState.getState().activeId).toBeNull();
    expect(useWorkspaceDocument.getState().sections).toEqual(documentBeforeFilter);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("keeps the list, scroll, and unaffected editor mounted and clears empty results to focus", async () => {
    const input = await mount();
    const scrollArea = host.querySelector<HTMLElement>(".overflow-y-scroll");
    if (!scrollArea) {
      throw new Error("The item list scroll area did not render.");
    }
    scrollArea.scrollTop = 44;
    scrollArea.dispatchEvent(new Event("scroll", { bubbles: true }));

    await act(async () => setInputValue(input, "beta"));
    const survivingEditor = host.querySelector<HTMLInputElement>('[aria-label="Worker editor"]');
    expect(survivingEditor).not.toBeNull();

    await act(async () => setInputValue(input, "bet"));
    expect(host.querySelector('[aria-label="Worker editor"]')).toBe(survivingEditor);
    expect(host.querySelector(".overflow-y-scroll")).toBe(scrollArea);
    expect(scrollArea.scrollTop).toBe(44);

    await act(async () => setInputValue(input, "no match"));
    expect(host.textContent).toContain("No parameters in this list match “no match”.");
    const clearButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Clear filter",
    );
    if (!clearButton) {
      throw new Error("The empty filter state did not expose its clear action.");
    }
    await act(async () => clearButton.click());

    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("");
    expect(host.querySelector('[aria-label="Worker editor"]')).not.toBeNull();
    expect(host.querySelector(".overflow-y-scroll")).toBe(scrollArea);
    expect(scrollArea.scrollTop).toBe(44);
    expect(onDocumentChange).not.toHaveBeenCalled();
  });
});
