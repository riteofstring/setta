/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { registerWorkspaceMenuActions } from "../context-menu/workspaceMenuRegistry";
import { useWorkspaceMenuState } from "../context-menu/workspaceMenuState";
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

const observedResizeTargets = new Map<Element, ResizeObserverCallback>();

class CapturingResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    observedResizeTargets.set(target, this.callback);
  }

  unobserve(target: Element) {
    observedResizeTargets.delete(target);
  }

  disconnect() {}
}

globalThis.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver;

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
        id === "item-root"
          ? { id, children: childrenById[id] ?? [] }
          : {
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
        overflowMode: false,
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

function loadTypedSwitchDocument(helpText?: string) {
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
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "item-root",
          items: {
            "item-root": { id: "item-root", children: ["item-switch"] },
            "item-switch": {
              id: "item-switch",
              children: [],
              presentation: {
                label: "enabled",
                ...(helpText === undefined ? {} : { helpText }),
                control: {
                  kind: "switch",
                  value: "true",
                  configuration: { disabled: false },
                },
              },
            },
          },
          selectedItemIds: [],
        },
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

function getRequiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
  description: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`expected ${description}`);
  }
  return element;
}

function getAccessibleDescription(control: HTMLElement): string {
  const descriptionId = control.getAttribute("aria-describedby");
  const description = descriptionId ? document.getElementById(descriptionId) : null;
  if (!description) {
    throw new Error("expected the control's accessible description");
  }
  return description.textContent ?? "";
}

function createPointerEvent(
  type: string,
  init: MouseEventInit & { pointerId?: number; pointerType?: string } = {},
): MouseEvent {
  const event = new MouseEvent(type, init);
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: init.pointerType ?? "mouse" },
  });
  return event;
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
    registerWorkspaceMenuActions([]);
    useWorkspaceMenuState.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    observedResizeTargets.clear();
  });

  async function mount(props: Partial<Parameters<typeof WorkspaceItemList>[0]> = {}) {
    await act(async () => {
      root.render(
        createElement(
          "div",
          { "data-section-id": "panel" },
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
        ),
      );
    });
  }

  function getListOuter(): HTMLElement {
    const scrollArea = host.querySelector<HTMLElement>(".overflow-y-scroll");
    const listOuter = scrollArea?.parentElement;
    if (!listOuter) {
      throw new Error("expected the package-owned item-list outer");
    }
    return listOuter;
  }

  function resizeListOuter(listOuter: HTMLElement, width: number) {
    Object.defineProperty(listOuter, "clientWidth", { configurable: true, value: width });
    const callback = observedResizeTargets.get(listOuter);
    if (!callback) {
      throw new Error("expected the item-list outer to be resize-observed");
    }
    callback(
      [
        {
          target: listOuter,
          borderBoxSize: [],
          contentRect: { width },
        } as unknown as ResizeObserverEntry,
      ],
      new CapturingResizeObserver(callback) as unknown as ResizeObserver,
    );
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

  it("renders a typed built-in row without a host renderer and commits its value", async () => {
    loadTypedSwitchDocument();
    await mount({ topLevelItemIds: ["item-switch"], renderItem: undefined });

    expect(document.getElementById("ItemNameInput-panel-item-switch")?.textContent).toBe("enabled");
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!toggle) {
      throw new Error("expected the built-in switch row");
    }
    act(() => toggle.click());
    expect(
      useWorkspaceDocument.getState().sections.panel?.itemTree?.items["item-switch"]?.presentation
        ?.control,
    ).toMatchObject({ kind: "switch", value: "false" });
  });

  it("portals accessible typed-item help without stealing active editor focus", async () => {
    loadTypedSwitchDocument("Enable the optional retry path.");
    await mount({ topLevelItemIds: ["item-switch"], renderItem: undefined });

    const helpTrigger = getRequiredElement<HTMLButtonElement>(
      host,
      '[data-setta-workspace-item-help-trigger="true"]',
      "the built-in item help trigger",
    );
    expect(helpTrigger.getAttribute("aria-label")).toBe("Show help for enabled");
    expect(helpTrigger.classList.contains("h-6")).toBe(true);
    expect(helpTrigger.classList.contains("w-6")).toBe(true);
    expect(getAccessibleDescription(helpTrigger)).toBe("Enable the optional retry path.");

    host.dir = "rtl";
    const nameEditor = getRequiredElement<HTMLElement>(
      host,
      "#ItemNameInput-panel-item-switch",
      "the built-in item name editor",
    );
    await act(async () => {
      nameEditor.focus();
    });
    const activeEditor = document.activeElement;
    expect(activeEditor?.getAttribute("role")).toBe("textbox");
    await act(async () => {
      helpTrigger.dispatchEvent(
        createPointerEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      helpTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const helpContent = getRequiredElement<HTMLElement>(
      document,
      '[role="dialog"][aria-label="enabled help"]',
      "the portaled item help dialog",
    );
    expect(helpContent.textContent).toBe("Enable the optional retry path.");
    expect(helpContent.getAttribute("role")).toBe("dialog");
    expect(helpContent.getAttribute("aria-label")).toBe("enabled help");
    expect(helpContent.dir).toBe("rtl");
    expect(host.contains(helpContent)).toBe(false);
    expect(document.activeElement).toBe(activeEditor);
    expect(helpTrigger.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      helpTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"][aria-label="enabled help"]')).toBeNull();
  });

  it("fails specifically when a custom row has no renderer", async () => {
    await expect(mount({ renderItem: undefined })).rejects.toThrowError(
      "Custom item panel/item-a requires a registered row renderer.",
    );
  });

  it("renders the compact shared column divider on every real row and gates layout edits", async () => {
    await mount();

    const handles = host.querySelectorAll<HTMLElement>('[data-item-column-resize-handle="true"]');
    expect(handles).toHaveLength(4);
    const firstHandle = handles[0];
    if (!firstHandle) {
      throw new Error("expected the first item-column handle");
    }
    expect(firstHandle.className).toContain("-ml-2 flex w-4 touch-none cursor-col-resize");
    expect(firstHandle.className).toContain("setta-prevent-section-active-css");
    expect(firstHandle.className).toContain("setta-prevent-arrow-keys-moving-section");
    expect(firstHandle.className).toContain("nopan nodrag");
    expect(firstHandle.getAttribute("aria-label")).toBe("Resize item columns; activate to reset");
    expect(firstHandle.tabIndex).toBe(0);
    expect([...handles].slice(1).every((handle) => handle.tabIndex === -1)).toBe(true);
    expect(firstHandle.parentElement?.className).toContain(
      "section-center relative mx-auto h-[90%] w-0.5",
    );
    expect(firstHandle.firstElementChild?.className).toContain("w-1.5 rounded bg-transparent");

    await act(async () => {
      useWorkspaceCapabilities.setState({ canEditLayout: false });
    });
    expect(host.querySelector('[data-item-column-resize-handle="true"]')).toBeNull();
  });

  it("drags at canvas scale and persists once", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    if (!columnContainer) {
      throw new Error("expected the package-owned section column container");
    }
    act(() => resizeListOuter(listOuter, 550));
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("257px");

    useReactFlow.setState({ transform: [0, 0, 2] });
    const handle = host.querySelector<HTMLElement>('[data-item-column-resize-handle="true"]');
    if (!handle) {
      throw new Error("expected an item-column resize handle");
    }
    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          detail: 1,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
      window.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 140,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("277px");

    await act(async () => {
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 7 }));
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(277);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    expect(onDocumentChange.mock.calls[0]?.[0]?.sections["panel"]?.itemTree?.itemColumnWidth).toBe(
      277,
    );
  });

  it("commits the final pointer sample when release beats the animation frame", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLElement>('[data-item-column-resize-handle="true"]');
    if (!columnContainer || !handle) {
      throw new Error("expected the item-column surface");
    }
    act(() => resizeListOuter(listOuter, 550));
    useReactFlow.setState({ transform: [0, 0, 2] });

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          detail: 1,
          pointerId: 11,
          pointerType: "touch",
        }),
      );
      window.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 140,
          pointerId: 11,
          pointerType: "touch",
        }),
      );
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 11 }));
    });

    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("277px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(277);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
  });

  it("restores the authored split without committing when a pointer drag is canceled", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLElement>('[data-item-column-resize-handle="true"]');
    if (!columnContainer || !handle) {
      throw new Error("expected the item-column surface");
    }
    act(() => resizeListOuter(listOuter, 550));

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          detail: 1,
          pointerId: 12,
          pointerType: "touch",
        }),
      );
      window.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 140,
          pointerId: 12,
          pointerType: "touch",
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("297px");

    await act(async () => {
      window.dispatchEvent(createPointerEvent("pointercancel", { pointerId: 12 }));
    });

    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("257px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(
      undefined,
    );
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("resizes the live split proportionally and double-click resets it", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLElement>('[data-item-column-resize-handle="true"]');
    if (!columnContainer || !handle) {
      throw new Error("expected the item-column surface");
    }
    act(() => resizeListOuter(listOuter, 550));
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("267px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(267);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);

    act(() => resizeListOuter(listOuter, 660));
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("324px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(267);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);
    onDocumentChange.mockClear();

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          detail: 1,
          pointerId: 21,
        }),
      );
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 21 }));
      handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          detail: 2,
          pointerId: 22,
        }),
      );
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 22 }));
      handle.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      handle.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }),
      );
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("312px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(312);
    expect(onDocumentChange).toHaveBeenCalledOnce();
  });

  it("mirrors pointer and keyboard divider movement in rtl without changing column meaning", async () => {
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLButtonElement>('[data-item-column-resize-handle="true"]');
    if (!columnContainer || !handle) {
      throw new Error("expected the rtl item-column surface");
    }
    columnContainer.dir = "rtl";
    act(() => resizeListOuter(listOuter, 550));

    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      );
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("267px");

    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 140,
          pointerId: 9,
          pointerType: "touch",
        }),
      );
      window.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 120,
          pointerId: 9,
          pointerType: "touch",
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("287px");

    await act(async () => {
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 9 }));
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(287);
  });

  it("offers one keyboard path for the shared split without adding every row to tab order", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLButtonElement>(
      '[data-item-column-resize-handle="true"][tabindex="0"]',
    );
    if (!columnContainer || !handle) {
      throw new Error("expected the keyboard item-column surface");
    }
    act(() => resizeListOuter(listOuter, 550));
    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("267px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(267);
    expect(onDocumentChange).toHaveBeenCalledTimes(1);

    await act(async () => {
      activateItemSelect();
    });
    act(() => handle.click());
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("257px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(257);
    expect(onDocumentChange).toHaveBeenCalledTimes(2);
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.selectedItemIds).toEqual(
      [],
    );
  });

  it("prunes invisible subtrees through the visible-set seam", async () => {
    await mount({ visibleItemIds: ["item-a", "item-b"] });

    expect(host.querySelector('[data-testid="row-item-a"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="row-item-group"]')).toBeNull();
    expect(host.querySelector('[data-testid="row-item-c"]')).toBeNull();
  });

  it("renders the nested-root layout when a non-group row has child rows", async () => {
    // The reference's "renders the nested-root layout when top-level params have child rows":
    // a leaf-styled row that carries children takes the subgrid nested-root layout.
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
          overflowMode: false,
          tagColor: null,
          children: [],
          itemTree: {
            rootId: "item-root",
            items: {
              "item-root": { id: "item-root", children: ["item-nest"] },
              "item-nest": { id: "item-nest", children: ["item-n1"], data: { group: false } },
              "item-n1": { id: "item-n1", children: [], data: { group: false } },
            },
            selectedItemIds: [],
          },
        },
      },
      topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
    await mount({ topLevelItemIds: ["item-nest"] });

    const nestedRootRow = getRowByContent(host, "item-nest");
    expect(nestedRootRow.className).toContain("section-args-nested-key-value");
    expect(nestedRootRow.style.gridTemplateColumns).toContain("[c3]");

    // Scoped to the row: the package list-area shell is also a `section-args-nested` grid.
    const rail = nestedRootRow.querySelector<HTMLElement>("div.section-args-nested");
    expect(rail?.contains(getRowByContent(host, "item-n1"))).toBe(true);
  });

  it("wraps rows in the reference shell and gates only vertical wheel on scrollability", async () => {
    await mount();

    const shell = host.querySelector<HTMLElement>("div.overflow-y-scroll");
    if (!shell) {
      throw new Error("expected the package-owned list-area shell");
    }
    expect(shell.className.trim()).toBe(
      "section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min content-start " +
        "gap-y-1 overflow-x-clip overflow-y-scroll py-2 pe-1.5",
    );
    expect(shell.parentElement?.className).toBe(
      "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
    );
    expect(shell.contains(getRowByContent(host, "item-a"))).toBe(true);

    // Overflowing content flips the vertical wheel gate. Horizontal input still belongs to the
    // canvas, and scrollability is re-measured through the reference's content observer.
    Object.defineProperty(shell, "scrollHeight", { value: 100 });
    await act(async () => {
      shell.setAttribute("data-remeasure", "overflow");
      await Promise.resolve();
    });
    expect(shell.classList.contains("setta-native-wheel-y")).toBe(true);
    expect(shell.classList.contains("nowheel")).toBe(false);
  });

  it("preserves the list element and scroll position when item-select mode activates", async () => {
    await mount();

    const shell = host.querySelector<HTMLElement>("div.overflow-y-scroll");
    if (!shell) {
      throw new Error("expected the package-owned list-area shell");
    }
    shell.scrollTop = 48;

    await act(async () => {
      activateItemSelect();
    });

    expect(host.querySelector("div.overflow-y-scroll")).toBe(shell);
    expect(shell.scrollTop).toBe(48);
  });

  it("takes the section-style-theme treatments only when the style color derives a theme", async () => {
    const loadPanelWithStyleColor = (styleColor: string | null) => {
      const itemTree = makeItemTree();
      itemTree.selectedItemIds = ["item-a"];
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
            styleColor,
            overflowMode: false,
            tagColor: null,
            children: [],
            itemTree,
          },
        },
        topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
        viewport: { x: 0, y: 0, zoom: 1 },
        activeIds: [],
      });
    };

    loadPanelWithStyleColor("#3b82f6");
    await mount();
    expect(getRowByContent(host, "item-a").className).toContain(
      "!bg-[color:var(--setta-section-style-outline)]",
    );

    // A style color that derives no theme leaves the row on the plain selected treatment,
    // matching the section chrome's derived-theme gate.
    loadPanelWithStyleColor("");
    await mount();
    const plainRow = getRowByContent(host, "item-a");
    expect(plainRow.className).toContain("!bg-blue-700");
    expect(plainRow.className).not.toContain("--setta-section-style-outline");
  });

  it("registers its list view while mounted", async () => {
    await mount();
    expect(resolveItemListView("panel", "item-c", LIST_KEY)?.listKey).toBe(LIST_KEY);

    await act(async () => {
      root.render(createElement(ItemDndContext, null));
    });
    expect(resolveItemListView("panel", "item-c", LIST_KEY)).toBeNull();
  });

  it("updates its registered view in place on re-render", async () => {
    await mount();
    expect(resolveItemListView("panel", "item-c", LIST_KEY)?.listKey).toBe(LIST_KEY);

    await mount({ visibleItemIds: ["item-a", "item-b"] });
    expect(resolveItemListView("panel", "item-c", LIST_KEY)).toBeNull();
    expect(resolveItemListView("panel", "item-a", LIST_KEY)?.listKey).toBe(LIST_KEY);
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

  it("exposes row groups to Tab with named state and keyboard toggles only in item-select mode", async () => {
    await mount();
    let row = getRowByContent(host, "item-a");
    expect(row.tabIndex).toBe(-1);
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("aria-disabled")).toBeNull();
    expect(row.getAttribute("aria-pressed")).toBeNull();

    await act(async () => {
      activateItemSelect();
    });
    row = getRowByContent(host, "item-a");
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("role")).toBe("group");
    expect(row.getAttribute("aria-label")).toBe("Selectable item item-a, not selected");
    expect(row.getAttribute("aria-keyshortcuts")).toBe("Enter Space Shift+F10 ContextMenu");
    expect(row.getAttribute("aria-pressed")).toBeNull();
    expect(row.className).toContain("focus-visible:-outline-offset-2");
    row.focus();
    await act(async () => {
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(getRowByContent(host, "item-a").getAttribute("aria-label")).toBe(
      "Selectable item item-a, selected",
    );
    await act(async () => {
      getRowByContent(host, "item-a").dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      );
    });
    expect(getRowByContent(host, "item-a").getAttribute("aria-label")).toBe(
      "Selectable item item-a, not selected",
    );
  });

  it("opens package and registered item actions from pointer and keyboard invocation", async () => {
    registerWorkspaceMenuActions([
      { id: "host-item", scope: "item", label: "Host item", onSelect: vi.fn() },
    ]);
    await mount();
    let row = getRowByContent(host, "item-a");
    expect(row.getAttribute("aria-keyshortcuts")).toBe("Shift+F10 ContextMenu");
    expect(row.dataset["workspaceItemId"]).toBe("item-a");

    const pointerEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      clientY: 80,
    });
    await act(async () => {
      row.dispatchEvent(pointerEvent);
    });
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "item",
      context: { scope: "item", section: { id: "panel" }, item: { id: "item-a" } },
    });

    useWorkspaceMenuState.getState().reset();
    row = getRowByContent(host, "item-a");
    row.getBoundingClientRect = () =>
      ({ left: 10, right: 210, top: 30, width: 200, height: 24 }) as DOMRect;
    await act(async () => {
      row.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ContextMenu",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "item",
      clientPoint: { x: 22, y: 42 },
    });
  });

  it("retains the native item menu without leaking the event to its section", async () => {
    const ancestorContextMenu = vi.fn();
    document.body.addEventListener("contextmenu", ancestorContextMenu);

    try {
      await mount({
        renderItem: (context) =>
          createElement(
            "button",
            { "data-testid": `row-${context.item.id}`, type: "button" },
            context.item.id,
          ),
      });
      const row = getRowByContent(host, "item-a");
      const nativeButton = row.querySelector("button");
      if (!nativeButton) {
        throw new Error("expected a native item control");
      }
      const pointerEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 80,
      });

      await act(async () => {
        nativeButton.dispatchEvent(pointerEvent);
      });

      expect(pointerEvent.defaultPrevented).toBe(false);
      expect(ancestorContextMenu).not.toHaveBeenCalled();
      expect(useWorkspaceMenuState.getState().invocation).toBeNull();
    } finally {
      document.body.removeEventListener("contextmenu", ancestorContextMenu);
    }
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
