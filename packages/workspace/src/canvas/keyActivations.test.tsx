/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDndState } from "../dnd/dndState";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import {
  indentSelectedItems,
  moveSelectedItemsDown,
  moveSelectedItemsUp,
  unindentSelectedItems,
} from "../items/selectedItemMoves";
import { useWorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useCanvasKeyActivations } from "./keyActivations";
import { initialCanvasState, useReactFlow } from "./store";

// The keyboard dispatch cases freeze the chord matching; the actions themselves are frozen by
// `selectedItemMoves.test.ts` against the real document store.
vi.mock("../items/selectedItemMoves", () => ({
  moveSelectedItemsUp: vi.fn(() => true),
  moveSelectedItemsDown: vi.fn(() => true),
  indentSelectedItems: vi.fn(() => true),
  unindentSelectedItems: vi.fn(() => true),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function KeyActivationsHost() {
  useCanvasKeyActivations();
  return null;
}

function loadItemDocument(selectedItemIds: Array<string>, activeIds: Array<string> = ["panel"]) {
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
  });
}

// jsdom reports no Mac user agent, so the mod key resolves to Control in these tests.
describe("useCanvasKeyActivations", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceTooltip.getState().reset();
    useDndState.getState().reset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(KeyActivationsHost));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerSectionKinds({});
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceTooltip.getState().reset();
    useDndState.getState().reset();
    useItemSelectionMode.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  async function dispatchKey(type: "keydown" | "keyup", key: string, target?: EventTarget) {
    await act(async () => {
      const event = new KeyboardEvent(type, { key, bubbles: true });
      (target ?? document).dispatchEvent(event);
    });
  }

  it("tracks the shift selection key", async () => {
    await dispatchKey("keydown", "Shift");
    expect(useReactFlow.getState().selectionKeyPressed).toBe(true);

    await dispatchKey("keyup", "Shift");
    expect(useReactFlow.getState().selectionKeyPressed).toBe(false);
  });

  it("activates multi-selection and zoom activation together on the mod key", async () => {
    await dispatchKey("keydown", "Control");
    expect(useReactFlow.getState().multiSelectionActive).toBe(true);
    expect(useReactFlow.getState().zoomActivationKeyPressed).toBe(true);

    await dispatchKey("keyup", "Control");
    expect(useReactFlow.getState().multiSelectionActive).toBe(false);
    expect(useReactFlow.getState().zoomActivationKeyPressed).toBe(false);
  });

  it("tracks the space pan activation key outside editable targets", async () => {
    await dispatchKey("keydown", " ");
    expect(useReactFlow.getState().panActivationKeyPressed).toBe(true);

    await dispatchKey("keyup", " ");
    expect(useReactFlow.getState().panActivationKeyPressed).toBe(false);
  });

  it("ignores the space pan activation key while typing in an input", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    await dispatchKey("keydown", " ", input);
    expect(useReactFlow.getState().panActivationKeyPressed).toBe(false);

    input.remove();
  });

  it("enables the tooltip while the tooltip key is held", async () => {
    await dispatchKey("keydown", "q");
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(true);

    await dispatchKey("keyup", "q");
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);
  });

  it("ignores the tooltip key while typing in an input", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    await dispatchKey("keydown", "q", input);
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);

    input.remove();
  });

  it("ignores the tooltip key with a modifier held", async () => {
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "q", ctrlKey: true, bubbles: true }),
      );
    });
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);
  });

  it("activates the free-move mode while Alt is held alone", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    });
    expect(useDndState.getState().isMovingFree).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("switches from free-move to sorting when the mod key joins Alt", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    });
    expect(useDndState.getState().isMovingFree).toBe(true);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", altKey: true, ctrlKey: true }),
      );
    });
    const state = useDndState.getState();
    expect(state.isSorting).toBe(true);
    expect(state.isMovingFree).toBe(false);
    expect(state.pendingDeactivation).toBe(false);

    // Releasing the mod key deactivates sorting without re-entering free move: the reference
    // engine only activates on keydown events.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", altKey: true }));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("does not activate a dnd mode while a non-modifier key is held", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true }),
      );
    });
    expect(useDndState.getState().isMovingFree).toBe(false);
  });

  it("does not re-activate a dnd mode from auto-repeat keydowns", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", altKey: true, ctrlKey: true }),
      );
    });
    expect(useDndState.getState().isSorting).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", altKey: true }));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(true);

    // Held modifiers auto-repeat keydowns on some platforms; the reference engine never
    // activates from a repeat, so free move must not re-enter while Alt stays held.
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Alt", altKey: true, repeat: true }),
      );
    });
    expect(useDndState.getState().isMovingFree).toBe(false);
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("releases sorting on mouse movement without the mod key held", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", altKey: true, ctrlKey: true }),
      );
    });
    expect(useDndState.getState().isSorting).toBe(true);

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(false);

    // An aborted Mod+Tab app switch delivers neither a keyup nor a blur; the first mouse
    // move without the mod key held releases the mod-gated mode, as the reference does.
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: false }));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("prunes stale held keys so a swallowed keyup cannot block activation", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
      });
      vi.setSystemTime(Date.now() + 150);
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
      });
      expect(useDndState.getState().isMovingFree).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the tooltip when another key goes down while the tooltip key is held", async () => {
    await dispatchKey("keydown", "q");
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(true);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }),
      );
    });
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);

    // Auto-repeats of the still-held tooltip key must not re-enable it; only a fresh press
    // does, matching the reference's pressed-key-set comparison.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "q", repeat: true }));
    });
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);

    await dispatchKey("keyup", "q");
    await dispatchKey("keydown", "q");
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(true);
  });

  it("queues dnd deactivation on window blur", async () => {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    });
    expect(useDndState.getState().isMovingFree).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(useDndState.getState().pendingDeactivation).toBe(true);
  });

  it("releases every activation on window blur", async () => {
    await dispatchKey("keydown", "Shift");
    await dispatchKey("keydown", "Control");
    await dispatchKey("keydown", " ");
    await dispatchKey("keydown", "q");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });

    const state = useReactFlow.getState();
    expect(state.selectionKeyPressed).toBe(false);
    expect(state.multiSelectionActive).toBe(false);
    expect(state.zoomActivationKeyPressed).toBe(false);
    expect(state.panActivationKeyPressed).toBe(false);
    expect(useWorkspaceTooltip.getState().isEnabled).toBe(false);
  });

  describe("item-select chord", () => {
    async function pressChord() {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, shiftKey: true }),
        );
      });
    }

    it("activates item-select mode while Mod+Shift is held and releases on keyup", async () => {
      await pressChord();
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(true);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", ctrlKey: true }));
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("clears and suppresses the exact-chord selection and multi-select states", async () => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
      });
      expect(useReactFlow.getState().selectionKeyPressed).toBe(true);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, shiftKey: true }),
        );
      });
      const state = useReactFlow.getState();
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(true);
      expect(state.selectionKeyPressed).toBe(false);
      expect(state.multiSelectionActive).toBe(false);
      expect(state.zoomActivationKeyPressed).toBe(false);

      // A repeat of the held Shift key must not re-arm the marquee while the chord holds.
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Shift",
            ctrlKey: true,
            shiftKey: true,
            repeat: true,
          }),
        );
      });
      expect(useReactFlow.getState().selectionKeyPressed).toBe(false);
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(true);
    });

    it("does not activate while a non-modifier key is held", async () => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
      });
      await pressChord();
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("does not activate from an auto-repeat keydown", async () => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Control",
            ctrlKey: true,
            shiftKey: true,
            repeat: true,
          }),
        );
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("releases when a non-modifier key joins the chord", async () => {
      await pressChord();
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, shiftKey: true }),
        );
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("releases a held dnd mode when the chord's Shift joins, without entering item select", async () => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
      });
      expect(useDndState.getState().isMovingFree).toBe(true);

      // Section-drag versus item-drag ownership: Shift breaks the free-move chord at once,
      // and Alt keeps the item-select chord from matching.
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Shift", altKey: true, shiftKey: true }),
        );
      });
      expect(useDndState.getState().pendingDeactivation).toBe(true);
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("releases the chord on mouse movement without the mod key held", async () => {
      await pressChord();
      await act(async () => {
        window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: true }));
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(true);

      await act(async () => {
        window.dispatchEvent(new MouseEvent("mousemove", { ctrlKey: false }));
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("releases the chord on window blur", async () => {
      await pressChord();
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
      });
      expect(useItemSelectionMode.getState().isSelectingItems).toBe(false);
    });

    it("does not arm the pan activation while a modifier is held", async () => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", ctrlKey: true }));
      });
      expect(useReactFlow.getState().panActivationKeyPressed).toBe(false);
    });
  });

  describe("item keyboard move shortcuts", () => {
    it("dispatches the offset moves on Alt+Arrow and allows repeats", async () => {
      const firstPress = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        altKey: true,
        cancelable: true,
      });
      await act(async () => {
        document.dispatchEvent(firstPress);
      });
      expect(vi.mocked(moveSelectedItemsDown)).toHaveBeenCalledTimes(1);
      expect(firstPress.defaultPrevented).toBe(true);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            repeat: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).toHaveBeenCalledTimes(2);

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", code: "ArrowDown" }));
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", altKey: true }),
        );
      });
      expect(vi.mocked(moveSelectedItemsUp)).toHaveBeenCalledTimes(1);
    });

    it("declines the move inside editable targets but still consumes the keypress", async () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
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
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            ctrlKey: true,
          }),
        );
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            code: "ArrowDown",
            altKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).not.toHaveBeenCalled();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }));
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", altKey: true }),
        );
      });
      expect(vi.mocked(moveSelectedItemsDown)).not.toHaveBeenCalled();
    });

    it("indents on Tab and unindents on Shift+Tab while the active section has selected items", async () => {
      loadItemDocument(["item-a"]);
      const tabPress = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        cancelable: true,
      });
      await act(async () => {
        document.dispatchEvent(tabPress);
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Tab", code: "Tab" }));
      });
      expect(vi.mocked(indentSelectedItems)).toHaveBeenCalledTimes(1);
      expect(tabPress.defaultPrevented).toBe(true);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey: true }),
        );
      });
      expect(vi.mocked(unindentSelectedItems)).toHaveBeenCalledTimes(1);
    });

    it("leaves Tab alone without an active item selection", async () => {
      loadItemDocument(["item-a"], []);
      const tabPress = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        cancelable: true,
      });
      await act(async () => {
        document.dispatchEvent(tabPress);
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
      document.body.appendChild(container);

      await act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }),
        );
      });
      expect(vi.mocked(indentSelectedItems)).not.toHaveBeenCalled();
      container.remove();
    });
  });

  describe("escape handling", () => {
    function getPanelSelection(): Array<string> {
      return useWorkspaceDocument.getState().sections["panel"]?.itemTree?.selectedItemIds ?? [];
    }

    async function pressEscape(target: EventTarget = document) {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
        target.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }),
        );
      });
    }

    it("unselects items first and only then clears an in-section active selection", async () => {
      loadItemDocument(["item-a"]);
      const sectionNode = document.createElement("div");
      sectionNode.className = "react-flow__node";
      sectionNode.setAttribute("data-id", "panel");
      sectionNode.tabIndex = -1;
      document.body.appendChild(sectionNode);

      await pressEscape(sectionNode);
      expect(getPanelSelection()).toEqual([]);
      expect(useActiveSections.getState().activeIds).toEqual(["panel"]);

      await pressEscape(sectionNode);
      expect(useActiveSections.getState().activeIds).toEqual([]);
      sectionNode.remove();
    });

    it("keeps the active selection when escape lands outside a section node", async () => {
      loadItemDocument([]);
      await pressEscape();
      expect(useActiveSections.getState().activeIds).toEqual(["panel"]);
    });

    it("ignores escape while typing in an input outside any section", async () => {
      loadItemDocument(["item-a"]);
      const input = document.createElement("input");
      document.body.appendChild(input);

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
      document.body.appendChild(sectionNode);

      await pressEscape(input);
      expect(getPanelSelection()).toEqual([]);
      sectionNode.remove();
    });
  });
});
