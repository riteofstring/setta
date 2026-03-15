// @vitest-environment jsdom

import { useMisc } from "state/stores/layoutInteractionStores";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoistedCanvasSurface = vi.hoisted(() => {
  let reactFlowState = {
    domNode: null as { getBoundingClientRect: () => DOMRect } | null,
    transform: [0, 0, 1] as [number, number, number],
  };
  return {
    getReactFlowState: () => reactFlowState,
    setReactFlowState: (
      next: Partial<{
        domNode: { getBoundingClientRect: () => DOMRect } | null;
        transform: [number, number, number];
      }>,
    ) => {
      reactFlowState = {
        ...reactFlowState,
        ...next,
      };
    },
    screenToFlowPosition: vi.fn((point: { x: number; y: number }) => point),
  };
});

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    getState: () => hoistedCanvasSurface.getReactFlowState(),
  },
}));

vi.mock("forks/xyflow/core/hooks/useViewportHelper", () => ({
  screenToFlowPosition: (...args: Array<{ x: number; y: number }>) =>
    hoistedCanvasSurface.screenToFlowPosition(...args),
}));

import {
  resolveProjectChatCanvasBootPosition,
  resolveProjectChatCanvasBootSectionSize,
  resolveProjectChatWindowSurfaceRect,
} from "./projectChatWindowingCanvasSurface";

function setElementRect(element: HTMLElement, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect;
}

describe("projectChatWindowingCanvasSurface", () => {
  beforeEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
    hoistedCanvasSurface.screenToFlowPosition.mockClear();
    hoistedCanvasSurface.setReactFlowState({
      domNode: null,
      transform: [0, 0, 1],
    });
    useMisc.setState({
      lastMouseUpLocation: null,
      lastMouseDownLocation: null,
      lastPaneClickLocation: { x: 0, y: 0 },
    });
  });

  it("finds the first visible project chat window surface rect", () => {
    // Canvas boot should size from the active visible window surface.
    const docked = document.createElement("div");
    docked.dataset.testid = "project-chat-bottom-dock-window-panel";
    docked.dataset.chatWindowInstanceId = "chat-window-1";
    setElementRect(docked, new DOMRect(10, 20, 0, 0));
    document.body.appendChild(docked);

    const floating = document.createElement("div");
    floating.dataset.testid = "project-chat-floating-window";
    floating.dataset.chatWindowInstanceId = "chat-window-1";
    setElementRect(floating, new DOMRect(40, 60, 320, 180));
    document.body.appendChild(floating);

    expect(resolveProjectChatWindowSurfaceRect("chat-window-1")).toEqual(
      new DOMRect(40, 60, 320, 180),
    );
  });

  it("clamps the boot position to the visible canvas when the source window overflows", () => {
    // Booting from a floating window should keep the new canvas section fully inside the viewport.
    hoistedCanvasSurface.setReactFlowState({
      domNode: {
        getBoundingClientRect: () => new DOMRect(100, 120, 400, 300),
      },
    });
    const floating = document.createElement("div");
    floating.dataset.testid = "project-chat-floating-window";
    floating.dataset.chatWindowInstanceId = "chat-window-1";
    setElementRect(floating, new DOMRect(430, 360, 160, 90));
    document.body.appendChild(floating);

    expect(resolveProjectChatCanvasBootPosition("chat-window-1")).toEqual({
      x: 340,
      y: 330,
    });
    expect(hoistedCanvasSurface.screenToFlowPosition).toHaveBeenCalledWith({
      x: 340,
      y: 330,
    });
  });

  it("derives canvas boot section size from the window surface and current zoom", () => {
    // Section size should match the window surface in flow-space units.
    hoistedCanvasSurface.setReactFlowState({
      transform: [0, 0, 2],
    });
    const maximized = document.createElement("div");
    maximized.dataset.testid = "project-chat-maximized-window";
    maximized.dataset.chatWindowInstanceId = "chat-window-1";
    setElementRect(maximized, new DOMRect(0, 0, 640, 420));
    document.body.appendChild(maximized);

    expect(resolveProjectChatCanvasBootSectionSize("chat-window-1")).toEqual({
      width: 320,
      height: 210,
    });
  });
});
