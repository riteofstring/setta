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
import {
  disableWorkspaceTooltip,
  enableWorkspaceTooltip,
  useWorkspaceTooltip,
} from "../tooltip/WorkspaceTooltip";
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

function loadTypedSwitchDocument(helpText?: string, labelEditable = true) {
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
                labelEditable,
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
    useWorkspaceTooltip.getState().reset();
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

  it("stages typed-item help from the whole row for the held-Q quick-info surface", async () => {
    loadTypedSwitchDocument("Enable the optional retry path.");
    await mount({ topLevelItemIds: ["item-switch"], renderItem: undefined });

    const row = getRequiredElement<HTMLDivElement>(
      host,
      '[data-workspace-item-id="item-switch"]',
      "the typed help row",
    );
    expect(row.getAttribute("aria-keyshortcuts")).toContain("Q");
    expect(row.querySelector('[data-setta-workspace-item-help-trigger="true"]')).toBeNull();
    await act(async () => {
      row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(useWorkspaceTooltip.getState()).toMatchObject({
      content: "Enable the optional retry path.",
      title: "enabled",
      tone: "default",
    });

    await act(async () => {
      enableWorkspaceTooltip();
    });
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(true);

    await act(async () => {
      disableWorkspaceTooltip();
      row.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(useWorkspaceTooltip.getState()).toMatchObject({ isEnabled: false, content: null });
  });

  it("styles and describes every diagnostic severity without relying on color alone", async () => {
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    await mount({
      itemDiagnostics: {
        "item-a": [
          { severity: "info", message: "This value applies after setup." },
          { severity: "warning", message: "Review this value before running." },
          { severity: "error", message: "Choose a value below 10." },
        ],
        "item-group": [{ severity: "warning", message: "Review the nested values." }],
        "item-c": [{ severity: "info", message: "This value is inherited." }],
      },
    });

    const errorRow = getRowByContent(host, "item-a");
    const warningRow = getRowByContent(host, "item-group");
    const infoRow = getRowByContent(host, "item-c");
    expect(errorRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("error");
    expect(warningRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("warning");
    expect(infoRow.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("info");
    expect(errorRow.className).toContain("bg-red-200");
    expect(warningRow.className).toContain("bg-amber-100/60");
    expect(infoRow.className).toContain("bg-sky-100/50");
    expect(errorRow.className).not.toContain("ring-");
    expect(errorRow.style.paddingInlineEnd).toBe("1.375rem");

    const errorMarker = getRequiredElement<HTMLElement>(
      errorRow,
      '[data-setta-workspace-item-diagnostic-marker="true"]',
      "the error diagnostic marker",
    );
    expect(errorMarker.className).toContain("h-[18px] w-[18px]");
    expect(errorMarker.getAttribute("aria-hidden")).toBe("true");
    expect(errorMarker.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(
      errorRow.querySelector('[data-setta-workspace-item-quick-info-description="true"]')
        ?.textContent,
    ).toContain("Error: Choose a value below 10.");

    await act(async () => {
      errorRow.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(useWorkspaceTooltip.getState()).toMatchObject({ title: "item-a", tone: "error" });
    expect(useWorkspaceTooltip.getState().content).toContain("Choose a value below 10.");
    expect(useWorkspaceTooltip.getState().content).toContain("Review this value before running.");
    expect(onDocumentChange).not.toHaveBeenCalled();
  });

  it("announces diagnostic replacement and clearing while preserving editor and row focus", async () => {
    loadTypedSwitchDocument();
    const onDocumentChange = vi.fn();
    setWorkspaceDocumentChangeCallback(onDocumentChange);
    const typedProps = {
      topLevelItemIds: ["item-switch"],
      renderItem: undefined,
    };
    await mount({
      ...typedProps,
      itemDiagnostics: {
        "item-switch": [{ severity: "info", message: "The host is checking this value." }],
      },
    });

    const row = getRequiredElement<HTMLDivElement>(
      host,
      '[data-workspace-item-id="item-switch"]',
      "the typed diagnostic row",
    );
    const nameEditor = getRequiredElement<HTMLElement>(
      row,
      "#ItemNameInput-panel-item-switch",
      "the typed item name editor",
    );
    const infoMarker = getRequiredElement<HTMLElement>(
      row,
      '[data-setta-workspace-item-diagnostic-marker="true"]',
      "the information diagnostic marker",
    );
    expect(infoMarker.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("info");
    expect(
      host.querySelector('[data-setta-workspace-item-diagnostic-announcer="true"]')?.textContent,
    ).toContain("Information for enabled: The host is checking this value.");

    await act(async () => nameEditor.focus());
    const activeEditor = document.activeElement;

    await mount({
      ...typedProps,
      itemDiagnostics: {
        "item-switch": [{ severity: "error", message: "Turn this setting off to continue." }],
      },
    });
    expect(document.activeElement).toBe(activeEditor);
    expect(activeEditor ? row.contains(activeEditor) : false).toBe(true);
    const errorMarker = getRequiredElement<HTMLElement>(
      row,
      '[data-setta-workspace-item-diagnostic-marker="true"]',
      "the updated error diagnostic marker",
    );
    expect(errorMarker.dataset.settaWorkspaceItemDiagnosticSeverity).toBe("error");
    expect(
      host.querySelector('[data-setta-workspace-item-diagnostic-announcer="true"]')?.textContent,
    ).toContain("Error for enabled: Turn this setting off to continue.");

    await mount({
      ...typedProps,
      itemDiagnostics: {
        "item-switch": [
          { severity: "error", message: "Turn this setting off to continue." },
          { severity: "error", message: "Turn this setting off to continue." },
        ],
      },
    });
    expect(
      row.querySelector('[data-setta-workspace-item-quick-info-description="true"]')?.textContent,
    ).toContain("Error: Turn this setting off to continue.");
    expect(
      host.querySelector('[data-setta-workspace-item-diagnostic-announcer="true"]')?.textContent,
    ).toContain("Parameter diagnostics updated.");

    await mount({ ...typedProps, itemDiagnostics: {} });
    expect(document.activeElement).toBe(activeEditor);
    expect(row.querySelector('[data-setta-workspace-item-diagnostic-marker="true"]')).toBeNull();
    expect(
      host.querySelector('[data-setta-workspace-item-diagnostic-announcer="true"]')?.textContent,
    ).toBe("Parameter diagnostics cleared.");
    expect(onDocumentChange).not.toHaveBeenCalled();
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
    expect(firstHandle.tagName).toBe("DIV");
    expect(firstHandle.hasAttribute("tabindex")).toBe(false);
    expect([...handles].every((handle) => handle.tabIndex === -1)).toBe(true);
    expect(firstHandle.parentElement?.className).toContain(
      "section-center relative mx-auto h-[90%] w-0.5",
    );
    expect(firstHandle.firstElementChild?.className).toContain("w-1.5 rounded bg-transparent");

    await act(async () => {
      useWorkspaceCapabilities.setState({ canEditLayout: false });
    });
    expect(host.querySelector('[data-item-column-resize-handle="true"]')).toBeNull();
  });

  it("renders static built-in labels without adding a name-editor tab stop", async () => {
    loadTypedSwitchDocument(undefined, false);
    await mount({ renderItem: undefined, topLevelItemIds: ["item-switch"] });

    const staticLabel = host.querySelector<HTMLElement>(
      '[data-workspace-static-item-label="true"]',
    );
    expect(staticLabel?.textContent).toBe("enabled");
    expect(staticLabel?.hasAttribute("tabindex")).toBe(false);
    expect(staticLabel?.hasAttribute("role")).toBe(false);
    expect(document.getElementById("ItemNameInput-panel-item-switch")).toBeNull();
    expect(host.querySelector('[aria-label="enabled value"]')).not.toBeNull();
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
    await act(async () => {
      handle.dispatchEvent(
        createPointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          pointerId: 31,
        }),
      );
      window.dispatchEvent(createPointerEvent("pointermove", { clientX: 110, pointerId: 31 }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 31 }));
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
        new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }),
      );
    });
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("312px");
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(312);
    expect(onDocumentChange).toHaveBeenCalledOnce();
  });

  it("mirrors pointer divider movement in rtl without changing column meaning", async () => {
    await mount();

    const listOuter = getListOuter();
    const columnContainer = host.querySelector<HTMLElement>('[data-section-id="panel"]');
    const handle = host.querySelector<HTMLElement>('[data-item-column-resize-handle="true"]');
    if (!columnContainer || !handle) {
      throw new Error("expected the rtl item-column surface");
    }
    columnContainer.dir = "rtl";
    act(() => resizeListOuter(listOuter, 550));

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
    expect(columnContainer.style.getPropertyValue("--param-column-width")).toBe("277px");

    await act(async () => {
      window.dispatchEvent(createPointerEvent("pointerup", { pointerId: 9 }));
    });
    expect(useWorkspaceDocument.getState().sections["panel"]?.itemTree?.itemColumnWidth).toBe(277);
  });

  it("keeps every repeated column divider out of the sequential focus order", async () => {
    await mount();

    const handles = Array.from(
      host.querySelectorAll<HTMLElement>('[data-item-column-resize-handle="true"]'),
    );
    expect(handles).not.toHaveLength(0);
    expect(handles.every((handle) => !handle.hasAttribute("tabindex"))).toBe(true);
    expect(host.querySelector('[data-item-column-resize-handle="true"][tabindex="0"]')).toBeNull();
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
