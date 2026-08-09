/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
