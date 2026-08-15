/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerWorkspaceCreationCommands,
  registerWorkspaceMenuActions,
} from "../context-menu/workspaceMenuRegistry";
import { useWorkspaceMenuState } from "../context-menu/workspaceMenuState";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import Pane from "./Pane";
import { initialCanvasState, useReactFlow } from "./store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  } as DOMRect;
}

function resetState(): void {
  registerWorkspaceCreationCommands([]);
  registerWorkspaceMenuActions([]);
  useWorkspaceMenuState.getState().reset();
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
}

describe("Pane context-menu ownership", () => {
  let host: HTMLDivElement;
  let canvas: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    resetState();
    registerWorkspaceCreationCommands([
      {
        id: "host-note",
        label: "Host note",
        group: "Host",
        createSection: () => {
          throw new Error("The Pane trigger test does not select the command.");
        },
      },
    ]);
    host = document.createElement("div");
    canvas = document.createElement("div");
    canvas.getBoundingClientRect = () => createRect(100, 50, 800, 600);
    document.body.append(host, canvas);
    useReactFlow.setState({ domNode: canvas, transform: [-200, 100, 2] });
    root = createRoot(host);
    await act(async () => {
      root.render(
        <Pane isSelecting={false}>
          <span data-testid="pane-child">Child</span>
        </Pane>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    canvas.remove();
    resetState();
  });

  function getPane(): HTMLDivElement {
    const pane = host.querySelector<HTMLDivElement>(".react-flow__pane");
    if (!pane) {
      throw new Error("Missing Pane surface.");
    }
    return pane;
  }

  it("opens only from the background pointer surface at the transformed coordinate", async () => {
    const pane = getPane();
    const pointerEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 300,
    });
    await act(async () => {
      pane.dispatchEvent(pointerEvent);
    });
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "pane",
      clientPoint: { x: 500, y: 300 },
      context: { scope: "pane", workspacePosition: { x: 300, y: 75 } },
    });

    useWorkspaceMenuState.getState().reset();
    const childEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    await act(async () => {
      host.querySelector('[data-testid="pane-child"]')?.dispatchEvent(childEvent);
    });
    expect(childEvent.defaultPrevented).toBe(false);
    expect(useWorkspaceMenuState.getState().invocation).toBeNull();
  });

  it("anchors Shift+F10 at the pane's logical leading geometry", async () => {
    const pane = getPane();
    pane.dir = "rtl";
    pane.getBoundingClientRect = () => createRect(20, 40, 400, 300);
    await act(async () => {
      pane.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(useWorkspaceMenuState.getState().invocation).toMatchObject({
      kind: "pane",
      clientPoint: { x: 408, y: 64 },
      direction: "rtl",
    });
  });
});
