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
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { resetItemListViews } from "../items/itemListRegistry";
import { WorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useCanvasKeyActivations } from "./keyActivations";
import { initialCanvasState } from "./store";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";

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

describe("useCanvasKeyActivations lifecycle and platform chords", () => {
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

  it("queues dnd deactivation on window blur", async () => {
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
      window.dispatchEvent(new Event("blur"));
    });
    expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
  });

  it("releases every activation on window blur", async () => {
    await dispatchKey("keydown", "Shift", { shiftKey: true });
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(false);

    await dispatchKey("keydown", "Control", { ctrlKey: true });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(false);
    expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
      false,
    );

    await dispatchKey("keydown", " ", { code: "Space" });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      true,
    );
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
      false,
    );

    await dispatchKey("keydown", "q", { code: "KeyQ" });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(true);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(testWorkspace.tooltip.getState().isEnabled).toBe(false);
  });

  describe("item-select chord", () => {
    async function pressChord() {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Shift",
            shiftKey: true,
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Control",
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      });
    }

    it("activates item-select mode while Mod+Shift is held and releases on keyup", async () => {
      await pressChord();
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        true,
      );

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keyup", {
            bubbles: true,
            key: "Shift",
            ctrlKey: true,
          }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("clears and suppresses the exact-chord selection and multi-select states", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Shift",
            shiftKey: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(true);

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Control",
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      });
      const state = testWorkspace.reactFlow.getState();
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        true,
      );
      expect(state.selectionKeyPressed).toBe(false);
      expect(state.multiSelectionActive).toBe(false);
      expect(state.zoomActivationKeyPressed).toBe(false);

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Shift",
            ctrlKey: true,
            shiftKey: true,
            repeat: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(
        false,
      );
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        true,
      );
    });

    it("does not activate while a non-modifier key is held", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "a",
            code: "KeyA",
          }),
        );
      });
      await pressChord();
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("does not activate from an auto-repeat keydown", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Shift",
            shiftKey: true,
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Control",
            ctrlKey: true,
            shiftKey: true,
            repeat: true,
          }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("releases when a non-modifier key joins the chord", async () => {
      await pressChord();
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "a",
            code: "KeyA",
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("releases a held dnd mode when the chord's Shift joins, without entering item select", async () => {
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
            key: "Shift",
            altKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(testWorkspace.dndState.getState().pendingDeactivation).toBe(true);
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
      expect(testWorkspace.reactFlow.getState().selectionKeyPressed).toBe(
        false,
      );
    });

    it("releases the chord on mouse movement without the mod key held", async () => {
      await pressChord();
      await act(async () => {
        window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        true,
      );

      await act(async () => {
        window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: false }));
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("releases the chord on window blur", async () => {
      await pressChord();
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("does not arm the pan activation while a modifier is held", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: " ",
            code: "Space",
            ctrlKey: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().panActivationKeyPressed).toBe(
        false,
      );
    });
  });

  describe("macOS chord handling", () => {
    beforeEach(async () => {
      mockIsMacOs = true;
      await act(async () => {
        root.unmount();
      });
      root = createRoot(host);
      await act(async () => {
        root.render(
          <WorkspaceTestProvider workspace={testWorkspace}>
            {createElement(KeyActivationsHost)}
          </WorkspaceTestProvider>,
        );
      });
    });

    afterEach(() => {
      mockIsMacOs = false;
    });

    it("activates the item chord with Meta and not with Control", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Shift",
            shiftKey: true,
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Meta",
            metaKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        true,
      );

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keyup", {
            bubbles: true,
            key: "Meta",
            shiftKey: true,
          }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keyup", { bubbles: true, key: "Shift" }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Control",
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(testWorkspace.itemSelectionMode.getState().isSelectingItems).toBe(
        false,
      );
    });

    it("clears swallowed held keys when Meta releases so chords can arm again", async () => {
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
            key: "Meta",
            metaKey: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(
        false,
      );

      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keyup", { bubbles: true, key: "Meta" }),
        );
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Meta",
            metaKey: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(
        true,
      );
      expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
        true,
      );
    });

    it("runs the ungroup command with Meta and Shift", async () => {
      loadUngroupDocument();
      const event = new KeyboardEvent("keydown", {
        key: "g",
        code: "KeyG",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      await act(async () => {
        host.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(
        testWorkspace.document.getState().sections["group"],
      ).toBeUndefined();
    });

    it("releases the mod-gated activations on mouse movement without Meta held", async () => {
      await act(async () => {
        host.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Meta",
            metaKey: true,
          }),
        );
      });
      expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(
        true,
      );

      await act(async () => {
        window.dispatchEvent(new MouseEvent("mousemove", { metaKey: false }));
      });
      expect(testWorkspace.reactFlow.getState().multiSelectionActive).toBe(
        false,
      );
      expect(testWorkspace.reactFlow.getState().zoomActivationKeyPressed).toBe(
        false,
      );
    });
  });

  describe("escape handling", () => {
    function getPanelSelection(): Array<string> {
      return (
        testWorkspace.document.getState().sections["panel"]?.itemTree
          ?.selectedItemIds ?? []
      );
    }

    async function pressEscape(target: EventTarget = host) {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
        target.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
      });
    }

    it("unselects items first and only then clears an in-section active selection", async () => {
      loadItemDocument(["item-a"]);
      const sectionNode = document.createElement("div");
      sectionNode.className = "react-flow__node";
      sectionNode.setAttribute("data-id", "panel");
      sectionNode.tabIndex = -1;
      const sectionInput = document.createElement("input");
      sectionNode.appendChild(sectionInput);
      host.appendChild(sectionNode);

      await pressEscape(sectionNode);
      expect(getPanelSelection()).toEqual([]);
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([
        "panel",
      ]);

      sectionInput.focus();
      expect(document.activeElement).toBe(sectionInput);
      await pressEscape(sectionNode);
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([]);
      expect(document.activeElement).not.toBe(sectionInput);
      sectionNode.remove();
    });

    it("keeps the active selection when escape lands outside a section node", async () => {
      loadItemDocument([]);
      await pressEscape();
      expect(testWorkspace.activeSections.getState().activeIds).toEqual([
        "panel",
      ]);
    });

    it("ignores escape while typing in an input outside any section", async () => {
      loadItemDocument(["item-a"]);
      const input = document.createElement("input");
      host.appendChild(input);

      await pressEscape(input);
      expect(getPanelSelection()).toEqual(["item-a"]);
      input.remove();
    });

    it("unselects items while typing inside a section node", async () => {
      loadItemDocument(["item-a"]);
      const sectionNode = document.createElement("div");
      sectionNode.className = "react-flow__node";
      sectionNode.setAttribute("data-id", "panel");
      const input = document.createElement("input");
      sectionNode.appendChild(input);
      host.appendChild(sectionNode);

      await pressEscape(input);
      expect(getPanelSelection()).toEqual([]);
      sectionNode.remove();
    });
  });
});
