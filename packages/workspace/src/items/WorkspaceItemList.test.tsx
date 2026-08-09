/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  replaceItemsWithTemp,
  updateItemChildren,
  useItemDndChildren,
} from "../dnd/itemDndChildren";
import { ItemDndContext } from "../dnd/ItemDndContext";
import {
  getItemDndId,
  getTempItemDndId,
  setItemDndState,
  useItemDndState,
} from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { activateItemSelect, useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceItem, WorkspaceSectionItemTree } from "../document/types";
import type { ItemRowRenderContext } from "./ItemListContext";
import { resetItemListViews, resolveItemListView } from "./itemListRegistry";
import { WorkspaceItemList } from "./WorkspaceItemList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the registered item surface: rows render the canonical tree through the host
// renderer with the reference's leaf/parent layouts and nested-children rail, selection
// clicks commit canonically in item-select mode, mounting registers the drag-start list
// view, and an active drag swaps the rows to the live projection with the temp placeholder.

const LIST_KEY = "main";

function makeItemTree(): WorkspaceSectionItemTree {
  const childrenById: Record<string, Array<string>> = {
    "item-root": ["item-a", "item-group", "item-b"],
    "item-group": ["item-c"],
  };
  const ids = ["item-root", "item-a", "item-group", "item-b", "item-c"];
  return {
    rootId: "item-root",
    items: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          id,
          children: childrenById[id] ?? [],
          data: { label: id, group: id === "item-group" },
        },
      ]),
    ),
    selectedItemIds: [],
  };
}

function loadTestDocument() {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
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
        tagColor: null,
        children: [],
        itemTree: makeItemTree(),
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

function isGroupItem(item: WorkspaceItem): boolean {
  const data = item.data;
  return (
    data !== null && typeof data === "object" && !Array.isArray(data) && data["group"] === true
  );
}

function renderRowContent(context: ItemRowRenderContext) {
  return createElement("span", { "data-testid": `row-${context.item.id}` }, context.item.id);
}

function getRowByContent(host: HTMLElement, itemId: string): HTMLElement {
  const content = host.querySelector(`[data-testid="row-${itemId}"]`);
  const row = content?.closest<HTMLElement>("[data-item-row]");
  if (!row) {
    throw new Error(`expected a rendered row for ${itemId}`);
  }
  return row;
}

describe("WorkspaceItemList", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    loadTestDocument();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    resetItemListViews();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
    useWorkspaceCapabilities.getState().reset();
    useItemSelectionMode.getState().reset();
    useItemDndState.getState().reset();
    useItemDndChildren.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(props: Partial<Parameters<typeof WorkspaceItemList>[0]> = {}) {
    await act(async () => {
      root.render(
        createElement(
          ItemDndContext,
          null,
          createElement(WorkspaceItemList, {
            sectionId: "panel",
            listKey: LIST_KEY,
            topLevelItemIds: ["item-a", "item-group", "item-b"],
            renderItem: renderRowContent,
            isGroupItem,
            ...props,
          }),
        ),
      );
    });
  }

  it("renders leaf and parent rows with the reference layouts and nested rail", async () => {
    await mount();

    const leafRow = getRowByContent(host, "item-a");
    expect(leafRow.className).toContain("section-key-value group/arg-group");
    expect(leafRow.style.gridTemplateAreas).toContain("key center-gutter value");

    const groupRow = getRowByContent(host, "item-group");
    expect(groupRow.className).toContain("section-args-nested section-lg-value");

    const rail = groupRow.querySelector<HTMLElement>("div.section-args-nested");
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("before:w-[0.4rem]");
    const nestedRow = getRowByContent(host, "item-c");
    expect(rail?.contains(nestedRow)).toBe(true);
  });

  it("prunes invisible subtrees through the visible-set seam", async () => {
    await mount({ visibleItemIds: ["item-a", "item-b"] });

    expect(host.querySelector('[data-testid="row-item-a"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="row-item-group"]')).toBeNull();
    expect(host.querySelector('[data-testid="row-item-c"]')).toBeNull();
  });

  it("registers its list view while mounted", async () => {
    await mount();
    expect(resolveItemListView("panel", "item-c", LIST_KEY)?.listKey).toBe(LIST_KEY);

    await act(async () => {
      root.render(createElement(ItemDndContext, null));
    });
    expect(resolveItemListView("panel", "item-c", LIST_KEY)).toBeNull();
  });

  it("toggles canonical selection from row clicks only in item-select mode", async () => {
    await mount();

    const row = getRowByContent(host, "item-a");
    await act(async () => {
      row.click();
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.selectedItemIds).toEqual(
      [],
    );

    await act(async () => {
      activateItemSelect();
    });
    // Enabling the list mounts the sortable context, which remounts the row subtree.
    await act(async () => {
      getRowByContent(host, "item-a").click();
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.selectedItemIds).toEqual([
      "item-a",
    ]);
    expect(getRowByContent(host, "item-a").className).toContain("!bg-blue-700");

    await act(async () => {
      getRowByContent(host, "item-a").click();
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.selectedItemIds).toEqual(
      [],
    );
  });

  it("renders the live projection with the temp placeholder during a drag", async () => {
    await mount();

    const tempId = getTempItemDndId(getItemDndId("item-a", LIST_KEY));
    await act(async () => {
      updateItemChildren({
        "item-root": ["item-a", "item-group", "item-b"],
        "item-group": ["item-c"],
      });
      replaceItemsWithTemp("item-a", LIST_KEY, ["item-a"]);
      setItemDndState({
        activeId: "item-a",
        sectionId: "panel",
        listKey: LIST_KEY,
        rootId: "item-root",
        draggingIds: ["item-a"],
        placeholderWidth: 220,
        placeholderHeight: 32,
      });
    });

    expect(host.querySelector('[data-testid="row-item-a"]')).toBeNull();
    const rows = host.querySelectorAll("[data-item-row]");
    const tempRow = [...rows].find((row) => row.className.includes("bg-blue-500/40"));
    expect(tempRow).not.toBeUndefined();
    expect(useItemDndChildren.getState().x["item-root"]).toEqual([tempId, "item-group", "item-b"]);
  });
});
