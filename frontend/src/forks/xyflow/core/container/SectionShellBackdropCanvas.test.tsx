/* @vitest-environment jsdom */

import type { Node } from "forks/xyflow/core/types";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage, useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SectionShellBackdropCanvas from "./SectionShellBackdropCanvas";
import {
  buildSectionShellBackdropScene,
  expandSectionShellBackdropBounds,
} from "./sectionShellBackdrop";

type MockCanvasContext = CanvasRenderingContext2D & {
  beginPath: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  roundRect: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
};

let contextByCanvas: WeakMap<HTMLCanvasElement, MockCanvasContext>;
let getContextSpy: ReturnType<typeof vi.spyOn>;
let root: Root | null = null;

function createMockCanvasContext(): MockCanvasContext {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillStyle: "#000000",
    lineWidth: 1,
    roundRect: vi.fn(),
    setTransform: vi.fn(),
    shadowBlur: 0,
    shadowColor: "transparent",
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeStyle: "#000000",
  } as unknown as MockCanvasContext;
}

function createNode(overrides: Partial<Node> & Pick<Node, "id">): Node {
  return {
    height: 60,
    position: { x: 0, y: 0 },
    tempZIndex: 0,
    width: 120,
    zIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetProjectStores();
  useLocalStorage.setState({ darkMode: false });
  contextByCanvas = new WeakMap();
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(function () {
      const context = createMockCanvasContext();
      contextByCanvas.set(this, context);
      return context;
    });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  getContextSpy.mockRestore();
  document.body.innerHTML = "";
  resetProjectStores();
});

describe("buildSectionShellBackdropScene", () => {
  it("keeps measurable nodes in z-order and computes their shared bounds", () => {
    const scene = buildSectionShellBackdropScene([
      createNode({
        id: "front",
        position: { x: 10, y: 20 },
        tempZIndex: 20,
        width: 100,
      }),
      createNode({
        id: "back",
        height: 40,
        position: { x: 200, y: 90 },
        tempZIndex: 5,
        width: 30,
      }),
      createNode({
        height: null,
        id: "missing-size",
      }),
    ]);

    expect(scene.bounds).toEqual({
      height: 110,
      width: 220,
      x: 10,
      y: 20,
    });
    expect(scene.frames.map((frame) => frame.id)).toEqual(["back", "front"]);
  });
});

describe("SectionShellBackdropCanvas", () => {
  it("sizes and paints one retained canvas around the current node bounds", async () => {
    useNodeInternals.setState({
      x: new Map([
        [
          "section-a",
          createNode({
            id: "section-a",
            position: { x: 10, y: 20 },
            style: { background: "rgb(240, 249, 255)" },
            tempZIndex: 15,
            width: 100,
          }),
        ],
        [
          "section-b",
          createNode({
            height: 40,
            id: "section-b",
            position: { x: 200, y: 90 },
            tempZIndex: 3,
            width: 30,
          }),
        ],
      ]),
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SectionShellBackdropCanvas));
    });

    const canvas = host.querySelector(
      '[data-testid="react-flow__section-shell-backdrop-canvas"]',
    );
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Expected the section shell backdrop canvas to render.");
    }

    const context = contextByCanvas.get(canvas);
    if (!context) {
      throw new Error("Expected a mock 2d canvas context.");
    }

    const expandedBounds = expandSectionShellBackdropBounds(
      {
        height: 110,
        width: 220,
        x: 10,
        y: 20,
      },
      24,
    );

    expect(canvas.style.left).toBe(`${expandedBounds.x}px`);
    expect(canvas.style.top).toBe(`${expandedBounds.y}px`);
    expect(canvas.style.width).toBe(`${expandedBounds.width}px`);
    expect(canvas.style.height).toBe(`${expandedBounds.height}px`);
    expect(canvas.width).toBe(expandedBounds.width);
    expect(canvas.height).toBe(expandedBounds.height);
    expect(context.clearRect).toHaveBeenCalledWith(
      0,
      0,
      expandedBounds.width,
      expandedBounds.height,
    );
    expect(context.roundRect).toHaveBeenNthCalledWith(1, 214, 94, 30, 40, 16);
    expect(context.roundRect).toHaveBeenNthCalledWith(3, 24, 24, 100, 60, 16);
    expect(context.fill).toHaveBeenCalledTimes(2);
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when there are no measurable section nodes", async () => {
    useNodeInternals.setState({ x: new Map() });

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SectionShellBackdropCanvas));
    });

    expect(
      host.querySelector('[data-testid="react-flow__section-shell-backdrop-canvas"]'),
    ).toBeNull();
  });
});
