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

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
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
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import { useCanvasKeyActivations } from "./keyActivations";
import { initialCanvasState } from "./store";

vi.mock("../items/selectedItemMoves", () => ({
  moveSelectedItemsUp: vi.fn(() => true),
  moveSelectedItemsDown: vi.fn(() => true),
  indentSelectedItems: vi.fn(() => true),
  unindentSelectedItems: vi.fn(() => true),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LEAF_KIND = {
  renderContent: () => null,
  itemArea: { toolbar: "authoring-and-filter" as const },
};

function KeyActivationsHost() {
  useCanvasKeyActivations();
  return null;
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
    topLevelSections: {
      panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds,
    savedViews: null,
  });
}

describe("useCanvasKeyActivations item movement", () => {
  let host: HTMLDivElement;
  let root: Root;
  let unregisterHostElement: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
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
          <KeyActivationsHost />
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
