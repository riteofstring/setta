/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCreationCommands } from "../context-menu/workspaceMenuRegistry";
import { useDndState } from "../dnd/dndState";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import { focusAdjacentTopLevelSection } from "../focus/sectionNavigation";
import { focusWorkspaceScope } from "../focus/workspaceFocusScopes";
import {
  registerItemListView,
  resetItemListViews,
} from "../items/itemListRegistry";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "../items/selectedItemMoves";
import { registerWorkspaceKeyBindings } from "../keybindings/workspaceKeyBindingRegistry";
import {
  getWorkspaceTooltipHandlers,
  useWorkspaceTooltip,
  WorkspaceTooltip,
} from "../tooltip/WorkspaceTooltip";
import { onFitViewHandler } from "./fitView";
import { useCanvasKeyActivations } from "./keyActivations";
import { initialCanvasState, useReactFlow } from "./store";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import {
  getCanZoomIn,
  getCanZoomOut,
  resetZoom,
  zoomIn,
  zoomOut,
  zoomToPointerLocation,
} from "./viewportHelpers";

vi.mock("../items/selectedItemMoves", () => ({
  moveSelectedItemsUp: vi.fn(() => true),
  moveSelectedItemsDown: vi.fn(() => true),
  indentSelectedItems: vi.fn(() => true),
  unindentSelectedItems: vi.fn(() => true),
}));

vi.mock("./fitView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fitView")>()),
  onFitViewHandler: vi.fn(() => true),
}));
vi.mock("./viewportHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./viewportHelpers")>()),
  getCanZoomIn: vi.fn(() => true),
  getCanZoomOut: vi.fn(() => true),
  getIsZoomRuntimeReady: vi.fn(() => true),
  resetZoom: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomToPointerLocation: vi.fn(() => true),
}));

vi.mock("../focus/sectionNavigation", () => ({
  focusAdjacentTopLevelSection: vi.fn(() => true),
}));
vi.mock("../focus/workspaceFocusScopes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../focus/workspaceFocusScopes")>()),
  focusWorkspaceScope: vi.fn(() => true),
}));

let mockIsMacOs = false;
vi.mock("./utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("./utils")>();
  return { ...original, isMacOs: () => mockIsMacOs };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LEAF_KIND = {
  renderContent: () => null,
  itemArea: { toolbar: "authoring-and-filter" as const },
};

function KeyActivationsHost() {
  useCanvasKeyActivations();
  return <WorkspaceTooltip />;
}

function loadItemDocument(
  selectedItemIds: Array<string>,
  activeIds: Array<string> = ["panel"],
) {
  registerSectionKinds(testWorkspace.host, { leaf: LEAF_KIND });
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
        itemTree: {
          rootId: "item-root",
          items: {
            "item-root": { id: "item-root", children: ["item-a", "item-b"] },
            "item-a": { id: "item-a", children: [] },
            "item-b": { id: "item-b", children: [] },
          },
          selectedItemIds,
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
    savedViews: null,
  });
}

function loadUngroupDocument(activeIds: Array<string> = ["group"]) {
  registerSectionKinds(testWorkspace.host, { leaf: LEAF_KIND });
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      group: {
        id: "group",
        kind: "group",
        name: "Group",
        size: { width: "auto", height: "auto" },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: ["child"],
      },
      child: {
        id: "child",
        kind: "leaf",
        name: "Child",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
      leaf: {
        id: "leaf",
        kind: "leaf",
        name: "Leaf",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: {
      group: { x: 0, y: 0, w: null, h: null, zIndex: 0 },
      leaf: { x: 300, y: 0, w: 200, h: 100, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
    savedViews: null,
  });
}

describe("useCanvasKeyActivations", () => {
  let host: HTMLDivElement;
  let root: Root;
  let unregisterHostElement: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    });
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.tooltip.getState().reset();
    testWorkspace.dndState.getState().reset();
    host = document.createElement("div");
    host.tabIndex = -1;
    document.body.appendChild(host);
    unregisterHostElement = registerWorkspaceHostElement(
      testWorkspace.host,
      host,
    );
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(KeyActivationsHost)}
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    unregisterHostElement();
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
    testWorkspace.tooltip.getState().reset();
    testWorkspace.dndState.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    resetItemListViews(testWorkspace.host);
  });

  async function dispatchKey(
    type: "keydown" | "keyup",
    key: string,
    init: KeyboardEventInit & { target?: EventTarget } = {},
  ) {
    const { target, ...eventInit } = init;
    await act(async () => {
      const event = new KeyboardEvent(type, {
        key,
        bubbles: true,
        ...eventInit,
      });
      (target ?? host).dispatchEvent(event);
    });
  }

  it("tracks the shift selection key", async () => {
    await dispatchKey("keydown", "Shift", { shiftKey: true });
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(true);

    await dispatchKey("keyup", "Shift");
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(false);
  });

  it("activates multi-selection and zoom activation together on the mod key", async () => {
    await dispatchKey("keydown", "Control", { ctrlKey: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(true);
    expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
      true,
    );

    await dispatchKey("keyup", "Control");
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);
    expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
      false,
    );
  });

  it("does not arm the marquee while Alt is held", async () => {
    await dispatchKey("keydown", "Shift", { shiftKey: true, altKey: true });
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(false);
  });

  it("releases multi-selection and zoom the moment Alt joins the mod key", async () => {
    await dispatchKey("keydown", "Control", { ctrlKey: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(true);

    await dispatchKey("keydown", "Alt", { ctrlKey: true, altKey: true });
    expect(testWorkspace.dndState.getState().isSorting).toBe(true);
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);
    expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
      false,
    );
  });

  it("ignores the marquee and multi-select keys while typing in an input", async () => {
    const input = document.createElement("input");
    host.appendChild(input);

    await dispatchKey("keydown", "Shift", { shiftKey: true, target: input });
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(false);

    await dispatchKey("keyup", "Shift", { target: input });
    await dispatchKey("keydown", "Control", { ctrlKey: true, target: input });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);

    input.remove();
  });

  it("does not re-arm multi-selection from auto-repeat mod keydowns after a release", async () => {
    await dispatchKey("keydown", "Control", { ctrlKey: true });
    await dispatchKey("keydown", "a", { code: "KeyA", ctrlKey: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);

    await dispatchKey("keyup", "a", { code: "KeyA", ctrlKey: true });
    await dispatchKey("keydown", "Control", { ctrlKey: true, repeat: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);
  });

  it("releases multi-selection and zoom on mouse movement without the mod key held", async () => {
    await dispatchKey("keydown", "Control", { ctrlKey: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(true);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
    });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(true);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: false }));
    });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);
    expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
      false,
    );
  });

  it("tracks the space pan activation key outside editable targets", async () => {
    await dispatchKey("keydown", " ", { code: "Space" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      true,
    );

    await dispatchKey("keyup", " ", { code: "Space" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      false,
    );
  });

  it("requires the exact space chord for the pan activation", async () => {
    await dispatchKey("keydown", " ", { code: "Space" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      true,
    );

    await dispatchKey("keydown", "a", { code: "KeyA" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      false,
    );

    await dispatchKey("keyup", "a", { code: "KeyA" });
    await dispatchKey("keyup", " ", { code: "Space" });

    await dispatchKey("keydown", "b", { code: "KeyB" });
    await dispatchKey("keydown", " ", { code: "Space" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      false,
    );
  });

  it("ignores the space pan activation key while typing in an input", async () => {
    const input = document.createElement("input");
    host.appendChild(input);

    await dispatchKey("keydown", " ", { code: "Space", target: input });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      false,
    );

    input.remove();
  });

  it("enables the tooltip while the tooltip key is held", async () => {
    await dispatchKey("keydown", "q", { code: "KeyQ" });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(true);

    await dispatchKey("keyup", "q", { code: "KeyQ" });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);
  });

  it("ignores the tooltip key while typing in an input", async () => {
    const input = document.createElement("input");
    host.appendChild(input);

    await dispatchKey("keydown", "q", { code: "KeyQ", target: input });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);

    input.remove();
  });

  it("ignores the tooltip key with a modifier held", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "q",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);
  });

  it("keeps Q active across page and copy chords", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers(
        testWorkspace.host,
        { content: "First page" },
        { content: "Second page" },
      ).onMouseEnter({ currentTarget: host });
    });

    await dispatchKey("keydown", "q", { code: "KeyQ" });
    await dispatchKey("keydown", "ArrowRight", { code: "ArrowRight" });
    expect(testWorkspace.tooltip.getState()).toMatchObject({
      isEnabled: true,
      pageIndex: 1,
    });

    await dispatchKey("keyup", "ArrowRight", { code: "ArrowRight" });
    await dispatchKey("keydown", "c", { code: "KeyC" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Second page");
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(true);

    await dispatchKey("keyup", "q", { code: "KeyQ" });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);
  });

  it("freezes with Q+F and keeps the tooltip open after Q is released", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers(testWorkspace.host, {
        content: "Freeze this",
      }).onMouseEnter({
        currentTarget: host,
      });
    });

    await dispatchKey("keydown", "q", { code: "KeyQ" });
    await dispatchKey("keydown", "f", { code: "KeyF" });
    expect(testWorkspace.tooltip.getState()).toMatchObject({
      isEnabled: true,
      isFrozen: true,
    });

    await dispatchKey("keyup", "f", { code: "KeyF" });
    await dispatchKey("keyup", "q", { code: "KeyQ" });
    expect(testWorkspace.tooltip.getState()).toMatchObject({
      isEnabled: true,
      isFrozen: true,
    });
  });

  it("gives a focused frozen tooltip page/copy keys and closes it with Escape", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers(
        testWorkspace.host,
        { content: "First frozen page" },
        { content: "Second frozen page" },
      ).onMouseEnter({ currentTarget: host });
    });

    await dispatchKey("keydown", "q", { code: "KeyQ" });
    await dispatchKey("keydown", "f", { code: "KeyF" });
    await dispatchKey("keyup", "f", { code: "KeyF" });
    await dispatchKey("keyup", "q", { code: "KeyQ" });
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");

    await dispatchKey("keydown", "ArrowRight", { code: "ArrowRight" });
    expect(testWorkspace.tooltip.getState().pageIndex).toBe(1);
    await dispatchKey("keyup", "ArrowRight", { code: "ArrowRight" });
    await dispatchKey("keydown", "c", { code: "KeyC" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Second frozen page",
    );

    await dispatchKey("keyup", "c", { code: "KeyC" });
    await dispatchKey("keydown", "Escape", { code: "Escape" });
    expect(testWorkspace.tooltip.getState()).toMatchObject({
      isEnabled: false,
      isFrozen: false,
    });
  });

  it("leaves bare page and copy keys alone when focus is outside a frozen tooltip", async () => {
    await act(async () => {
      getWorkspaceTooltipHandlers(
        testWorkspace.host,
        { content: "First frozen page" },
        { content: "Second frozen page" },
      ).onMouseEnter({ currentTarget: host });
    });
    await dispatchKey("keydown", "q", { code: "KeyQ" });
    await dispatchKey("keydown", "f", { code: "KeyF" });
    await dispatchKey("keyup", "f", { code: "KeyF" });
    await dispatchKey("keyup", "q", { code: "KeyQ" });
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    await act(async () => outsideButton.focus());

    await dispatchKey("keydown", "ArrowRight", { code: "ArrowRight" });
    await dispatchKey("keydown", "c", { code: "KeyC" });
    expect(testWorkspace.tooltip.getState().pageIndex).toBe(0);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    outsideButton.remove();
  });

  it("ungroups the complete active group selection on Shift+Mod+G", async () => {
    loadUngroupDocument();
    const event = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      host.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(testWorkspace.document.getState().sections["group"]).toBeUndefined();
    expect(
      testWorkspace.document.getState().topLevelSections["child"],
    ).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("leaves Shift+Mod+G to the browser for an unavailable mixed selection", async () => {
    loadUngroupDocument(["group", "leaf"]);
    const event = new KeyboardEvent("keydown", {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      host.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(testWorkspace.document.getState().sections["group"]).toBeDefined();
  });

  async function dispatchChord(
    init: KeyboardEventInit & { target?: EventTarget },
  ) {
    const { target, ...eventInit } = init;
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...eventInit,
    });
    await act(async () => {
      (target ?? host).dispatchEvent(event);
    });
    await dispatchKey("keyup", eventInit.key ?? "", {
      code: eventInit.code,
      target,
    });
    return event;
  }

  describe("configurable command chords", () => {
    afterEach(() => {
      registerWorkspaceKeyBindings(testWorkspace.host, []);
    });

    it("groups the active selection on Mod+G", async () => {
      loadUngroupDocument(["group", "leaf"]);

      const event = await dispatchChord({
        key: "g",
        code: "KeyG",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(true);
      const sections = testWorkspace.document.getState().sections;
      const created = Object.values(sections).find(
        (section) => section.kind === "group" && section.id !== "group",
      );
      expect(created?.children).toEqual(["group", "leaf"]);
    });

    it("leaves Mod+G to the browser when the selection cannot be grouped", async () => {
      loadUngroupDocument(["leaf"]);

      const event = await dispatchChord({
        key: "g",
        code: "KeyG",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(
        Object.keys(testWorkspace.document.getState().sections).sort(),
      ).toEqual(["child", "group", "leaf"]);
    });

    it("deletes the active selection on Backspace", async () => {
      loadUngroupDocument(["leaf"]);

      const event = await dispatchChord({
        key: "Backspace",
        code: "Backspace",
      });

      expect(event.defaultPrevented).toBe(true);
      expect(
        testWorkspace.document.getState().sections["leaf"],
      ).toBeUndefined();
    });

    it("leaves Backspace to the caret while typing", async () => {
      loadUngroupDocument(["leaf"]);
      const input = document.createElement("input");
      host.appendChild(input);

      const event = await dispatchChord({
        key: "Backspace",
        code: "Backspace",
        target: input,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(testWorkspace.document.getState().sections["leaf"]).toBeDefined();
      input.remove();
    });

    it("selects every parameter the single active section shows on Mod+A", async () => {
      loadItemDocument([], ["panel"]);
      registerItemListView(testWorkspace.host, "panel", {
        listKey: "main",
        topLevelItemIds: ["item-a", "item-b"],
        visibleItemIds: new Set(["item-a", "item-b"]),
        filterActive: false,
      });

      const event = await dispatchChord({
        key: "a",
        code: "KeyA",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(
        testWorkspace.document.getState().sections["panel"]?.itemTree
          ?.selectedItemIds,
      ).toEqual(["item-a", "item-b"]);
    });

    it("leaves Mod+A to the caret while typing", async () => {
      loadItemDocument([], ["panel"]);
      registerItemListView(testWorkspace.host, "panel", {
        listKey: "main",
        topLevelItemIds: ["item-a", "item-b"],
        visibleItemIds: new Set(["item-a", "item-b"]),
        filterActive: false,
      });
      const input = document.createElement("input");
      host.appendChild(input);

      const event = await dispatchChord({
        key: "a",
        code: "KeyA",
        ctrlKey: true,
        target: input,
      });

      expect(event.defaultPrevented).toBe(false);
      expect(
        testWorkspace.document.getState().sections["panel"]?.itemTree
          ?.selectedItemIds,
      ).toEqual([]);
      input.remove();
    });

    it("selects every section on Mod+A without a single active section", async () => {
      loadUngroupDocument([]);

      const event = await dispatchChord({
        key: "a",
        code: "KeyA",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([
        "group",
        "child",
        "leaf",
      ]);
    });

    it("selects the top-level sections outside groups on Mod+Shift+A", async () => {
      loadUngroupDocument(["group"]);

      const event = await dispatchChord({
        key: "a",
        code: "KeyA",
        ctrlKey: true,
        shiftKey: true,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([
        "leaf",
      ]);
    });

    it("answers to the chord a host rebinds an operation to", async () => {
      registerWorkspaceKeyBindings(testWorkspace.host, [
        { id: "workspace.ungroup-sections", chord: "Mod + U" },
      ]);
      loadUngroupDocument();

      const defaultChord = await dispatchChord({
        key: "g",
        code: "KeyG",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(defaultChord.defaultPrevented).toBe(false);
      expect(testWorkspace.document.getState().sections["group"]).toBeDefined();

      const hostChord = await dispatchChord({
        key: "u",
        code: "KeyU",
        ctrlKey: true,
      });
      expect(hostChord.defaultPrevented).toBe(true);
      expect(
        testWorkspace.document.getState().sections["group"],
      ).toBeUndefined();
    });
  });

  describe("viewport chords", () => {
    it("fits the view on F and zooms to the pointer on Z", async () => {
      await dispatchChord({ key: "f", code: "KeyF" });
      expect(onFitViewHandler).toHaveBeenCalledTimes(1);

      await dispatchChord({ key: "z", code: "KeyZ" });
      expect(zoomToPointerLocation).toHaveBeenCalledTimes(1);
    });

    it("leaves the bare viewport keys to the caret while typing", async () => {
      const input = document.createElement("input");
      host.appendChild(input);

      await dispatchChord({ key: "f", code: "KeyF", target: input });
      await dispatchChord({ key: "z", code: "KeyZ", target: input });

      expect(onFitViewHandler).not.toHaveBeenCalled();
      expect(zoomToPointerLocation).not.toHaveBeenCalled();
      input.remove();
    });

    it("freezes quick info on Q+F instead of fitting the view", async () => {
      await act(async () => {
        getWorkspaceTooltipHandlers(testWorkspace.host, {
          content: "Freeze this",
        }).onMouseEnter({
          currentTarget: host,
        });
      });
      await dispatchKey("keydown", "q", { code: "KeyQ" });

      await dispatchKey("keydown", "f", { code: "KeyF" });

      expect(onFitViewHandler).not.toHaveBeenCalled();
      expect(testWorkspace.tooltip.getState().isFrozen).toBe(true);
    });

    it("zooms in and out on Equal and Minus, and repeats while a key is held", async () => {
      await dispatchKey("keydown", "=", { code: "Equal" });
      await dispatchKey("keydown", "=", { code: "Equal", repeat: true });
      expect(zoomIn).toHaveBeenCalledTimes(2);
      await dispatchKey("keyup", "=", { code: "Equal" });

      await dispatchKey("keydown", "-", { code: "Minus" });
      expect(zoomOut).toHaveBeenCalledTimes(1);
    });

    it("does not zoom past a limit the toolbar's button is disabled at", async () => {
      vi.mocked(getCanZoomIn).mockReturnValueOnce(false);
      vi.mocked(getCanZoomOut).mockReturnValueOnce(false);

      await dispatchChord({ key: "=", code: "Equal" });
      await dispatchChord({ key: "-", code: "Minus" });

      expect(zoomIn).not.toHaveBeenCalled();
      expect(zoomOut).not.toHaveBeenCalled();
    });

    it("resets the zoom on Mod+Comma", async () => {
      const event = await dispatchChord({
        key: ",",
        code: "Comma",
        ctrlKey: true,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(resetZoom).toHaveBeenCalledTimes(1);
    });
  });

  describe("creation chords", () => {
    afterEach(() => {
      registerWorkspaceCreationCommands(testWorkspace.host, []);
    });

    function registerNoteCommand() {
      registerSectionKinds(testWorkspace.host, { leaf: LEAF_KIND });
      loadWorkspaceDocument(testWorkspace.host, {
        sections: {},
        topLevelSections: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        activeIds: [],
        savedViews: null,
      });
      testWorkspace.reactFlow.setState({ width: 800, height: 600 });
      registerWorkspaceCreationCommands(testWorkspace.host, [
        {
          id: "host-note",
          label: "Host note",
          group: "Host",
          chord: "N",
          createSection: () => ({
            id: "created",
            kind: "leaf",
            name: "Created",
            size: { width: 240, height: 120 },
            isMinimized: false,
            positionAndSizeLocked: false,
            isHorizontalOrientation: false,
            styleColor: null,
            overflowMode: false,
            tagColor: null,
            children: [],
          }),
        },
      ]);
    }

    it("creates the host's section on the chord it registered", async () => {
      registerNoteCommand();

      const event = await dispatchChord({ key: "n", code: "KeyN" });

      expect(event.defaultPrevented).toBe(true);
      expect(
        testWorkspace.document.getState().topLevelSections["created"],
      ).toMatchObject({
        x: 24,
        y: 24,
      });
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([
        "created",
      ]);
    });

    it("leaves the bare creation key to the caret while typing", async () => {
      registerNoteCommand();
      const input = document.createElement("input");
      host.appendChild(input);

      await dispatchChord({ key: "n", code: "KeyN", target: input });

      expect(
        testWorkspace.document.getState().sections["created"],
      ).toBeUndefined();
      input.remove();
    });
  });

  describe("focus chords", () => {
    it("walks the canvas sections on Alt+J and Alt+K", async () => {
      const forwards = await dispatchChord({
        key: "j",
        code: "KeyJ",
        altKey: true,
      });
      expect(forwards.defaultPrevented).toBe(true);
      expect(focusAdjacentTopLevelSection).toHaveBeenCalledWith(
        testWorkspace.host,
        1,
      );

      const backwards = await dispatchChord({
        key: "k",
        code: "KeyK",
        altKey: true,
      });
      expect(backwards.defaultPrevented).toBe(true);
      expect(focusAdjacentTopLevelSection).toHaveBeenCalledWith(
        testWorkspace.host,
        -1,
      );
    });

    it("hands Alt+J back to the browser when there is nowhere left to move", async () => {
      vi.mocked(focusAdjacentTopLevelSection).mockReturnValueOnce(false);

      const event = await dispatchChord({
        key: "j",
        code: "KeyJ",
        altKey: true,
      });

      expect(event.defaultPrevented).toBe(false);
    });

    it("focuses each pane and the canvas on the reference's Ctrl+Shift chords", async () => {
      const leading = await dispatchChord({
        key: "@",
        code: "Digit2",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(leading.defaultPrevented).toBe(true);
      expect(focusWorkspaceScope).toHaveBeenCalledWith(
        testWorkspace.host,
        "leading-pane",
      );

      await dispatchChord({
        key: "#",
        code: "Digit3",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(focusWorkspaceScope).toHaveBeenCalledWith(
        testWorkspace.host,
        "canvas",
      );

      await dispatchChord({
        key: "$",
        code: "Digit4",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(focusWorkspaceScope).toHaveBeenCalledWith(
        testWorkspace.host,
        "trailing-pane",
      );
    });

    it("keeps the focus chords available while typing", async () => {
      const input = document.createElement("input");
      host.appendChild(input);

      const event = await dispatchChord({
        key: "#",
        code: "Digit3",
        ctrlKey: true,
        shiftKey: true,
        target: input,
      });

      expect(event.defaultPrevented).toBe(true);
      expect(focusWorkspaceScope).toHaveBeenCalledWith(
        testWorkspace.host,
        "canvas",
      );
      input.remove();
    });

    it("hands a pane chord back to the browser when that pane is not mounted", async () => {
      vi.mocked(focusWorkspaceScope).mockReturnValueOnce(false);

      const event = await dispatchChord({
        key: "@",
        code: "Digit2",
        ctrlKey: true,
        shiftKey: true,
      });

      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("activates the free-move mode while Alt is held alone", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isMovingFree).toBe(true);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "Alt" }),
      );
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
  });

  it("switches from free-move to sorting when the mod key joins Alt", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isMovingFree).toBe(true);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Control",
          altKey: true,
          ctrlKey: true,
        }),
      );
    });
    const state = testWorkspace.dndState.getState();
    expect(state.isSorting).toBe(true);
    expect(state.isMovingFree).toBe(false);
    expect(state.pendingDeactivation).toBe(false);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keyup", {
          bubbles: true,
          key: "Control",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
  });

  it("does not activate a dnd mode while a non-modifier key is held", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "a", code: "KeyA" }),
      );
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          code: "AltLeft",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isMovingFree).toBe(false);
  });

  it("does not re-activate a dnd mode from auto-repeat keydowns", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
        }),
      );
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Control",
          altKey: true,
          ctrlKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isSorting).toBe(true);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keyup", {
          bubbles: true,
          key: "Control",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
          repeat: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isMovingFree).toBe(false);
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
  });

  it("releases sorting on mouse movement without the mod key held", async () => {
    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
        }),
      );
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Control",
          altKey: true,
          ctrlKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isSorting).toBe(true);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(false);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: false }));
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
  });

  it("keeps a held non-modifier key excluding chords regardless of hold duration", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "a",
            code: "KeyA",
          }),
        );
      });
      vi.setSystemTime(Date.now() + 150);
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Alt",
            altKey: true,
          }),
        );
      });
      expect(testWorkspace.dndState.getState().isMovingFree).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keyup", {
          bubbles: true,
          key: "a",
          code: "KeyA",
          altKey: true,
        }),
      );
      host.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "Alt" }),
      );
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Alt",
          altKey: true,
        }),
      );
    });
    expect(testWorkspace.dndState.getState().isMovingFree).toBe(true);
  });

  it("hides the tooltip when another key goes down while the tooltip key is held", async () => {
    await dispatchKey("keydown", "q");
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(true);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Shift",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);

    await act(async () => {
      host.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "q", repeat: true }),
      );
    });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);

    await dispatchKey("keyup", "q");
    await dispatchKey("keydown", "q");
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(true);
  });

  describe("item keyboard move shortcuts", () => {
    it("dispatches the offset moves on Alt+Arrow and allows repeats", async () => {
      const firstPress = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
        cancelable: true,
      });
      await act(async () => {
        host.dispatchEvent(firstPress);
      });
      expect(vi.mocked(moveSelectedItemsDown)).toHaveBeenCalledTimes(1);
      expect(firstPress.defaultPrevented).toBe(true);

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            repeat: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).toHaveBeenCalledTimes(2);

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keyup", {
            bubbles: true,
            key: "ArrowDown",
            code: "ArrowDown",
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowUp",
            code: "ArrowUp",
            altKey: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsUp)).toHaveBeenCalledTimes(1);
    });

    it("declines the move inside editable targets but still consumes the keypress", async () => {
      const input = document.createElement("input");
      host.appendChild(input);
      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
        cancelable: true,
        bubbles: true,
      });
      await act(async () => {
        input.dispatchEvent(event);
      });
      expect(vi.mocked(moveSelectedItemsDown)).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      input.remove();
    });

    it("requires the exact Alt chord with no other keys held", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            ctrlKey: true,
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).not.toHaveBeenCalled();

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "a",
            code: "KeyA",
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).not.toHaveBeenCalled();
    });

    it("indents on Tab and unindents on Shift+Tab while the active section has selected items", async () => {
      loadItemDocument(["item-a"]);
      const tabPress = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Tab",
        code: "Tab",
        cancelable: true,
      });
      await act(async () => {
        host.dispatchEvent(tabPress);
        host.dispatchEvent(
          new KeyboardEvent("keyup", {
            bubbles: true,
            key: "Tab",
            code: "Tab",
          }),
        );
      });
      expect(vi.mocked(indentSelectedItems)).toHaveBeenCalledTimes(1);
      expect(tabPress.defaultPrevented).toBe(true);

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Tab",
            code: "Tab",
            shiftKey: true,
          }),
        );
      });
      expect(vi.mocked(unindentSelectedItems)).toHaveBeenCalledTimes(1);
    });

    it("leaves Tab alone without an active item selection", async () => {
      loadItemDocument(["item-a"], []);
      const tabPress = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Tab",
        code: "Tab",
        cancelable: true,
      });
      await act(async () => {
        host.dispatchEvent(tabPress);
      });
      expect(vi.mocked(indentSelectedItems)).not.toHaveBeenCalled();
      expect(tabPress.defaultPrevented).toBe(false);
    });

    it("leaves Tab alone inside a [data-tab-native] subtree", async () => {
      loadItemDocument(["item-a"]);
      const container = document.createElement("div");
      container.setAttribute("data-tab-native", "");
      const input = document.createElement("input");
      container.appendChild(input);
      host.appendChild(container);

      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            code: "Tab",
            bubbles: true,
          }),
        );
      });
      expect(vi.mocked(indentSelectedItems)).not.toHaveBeenCalled();
      container.remove();
    });

    it("leaves Tab navigation native while the active item list is filtered", async () => {
      loadItemDocument(["item-a"]);
      registerItemListView(testWorkspace.host, "panel", {
        listKey: "main",
        topLevelItemIds: ["item-a", "item-b"],
        visibleItemIds: new Set(["item-a"]),
        filterActive: true,
      });
      const tabPress = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Tab",
        code: "Tab",
        cancelable: true,
      });

      await act(async () => {
        host.dispatchEvent(tabPress);
      });

      expect(vi.mocked(indentSelectedItems)).not.toHaveBeenCalled();
      expect(tabPress.defaultPrevented).toBe(false);
    });
  });
});
