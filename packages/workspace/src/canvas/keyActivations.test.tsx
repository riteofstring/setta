/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDndState } from "../dnd/dndState";
import { useWorkspaceTooltip } from "../tooltip/WorkspaceTooltip";
import { useCanvasKeyActivations } from "./keyActivations";
import { initialCanvasState, useReactFlow } from "./store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function KeyActivationsHost() {
  useCanvasKeyActivations();
  return null;
}

// jsdom reports no Mac user agent, so the mod key resolves to Control in these tests.
describe("useCanvasKeyActivations", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
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
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceTooltip.getState().reset();
    useDndState.getState().reset();
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
});
