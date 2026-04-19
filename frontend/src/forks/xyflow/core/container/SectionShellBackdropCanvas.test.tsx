/* @vitest-environment jsdom */

import type { Node } from "forks/xyflow/core/types";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalStorage, useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SectionShellBackdropCanvas, {
  resolveCanvasOwnedSectionBackdropMeasurementPlan,
  useBackdropMeasurementViewportScale,
} from "./SectionShellBackdropCanvas";
import {
  buildSectionShellBackdropScene,
  expandSectionShellBackdropBounds,
} from "./sectionShellBackdrop";
import {
  BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
} from "./sectionShellCanvasOwnership";
import { useReactFlow } from "../store";

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

describe("resolveCanvasOwnedSectionBackdropMeasurementPlan", () => {
  it("limits callable-only detail bands to the callable shell lane", () => {
    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toMatchObject({
      includesCallableDetailBands: true,
      measuresNestedGuideBoxes: true,
      measuresUnderlineBoxes: false,
    });

    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toMatchObject({
      includesCallableDetailBands: false,
      measuresNestedGuideBoxes: true,
      measuresUnderlineBoxes: true,
    });
  });

  it("enables only the section detail families that the retained canvas can render", () => {
    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        DICT_CANVAS_OWNED_SECTION_SHELL_ID,
      ),
    ).toMatchObject({
      measuresFilterIconBoxes: true,
      measuresNestedGuideBoxes: true,
      measuresRestingDropdownBoxes: false,
      measuresUnderlineBoxes: false,
    });

    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toMatchObject({
      measuresFilterIconBoxes: false,
      measuresNestedGuideBoxes: true,
      measuresRestingDropdownBoxes: false,
      measuresUnderlineBoxes: true,
    });

    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      ),
    ).toMatchObject({
      measuresFilterIconBoxes: false,
      measuresNestedGuideBoxes: false,
      measuresRestingDropdownBoxes: true,
      measuresUnderlineBoxes: true,
    });

    expect(
      resolveCanvasOwnedSectionBackdropMeasurementPlan(
        SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      ),
    ).toMatchObject({
      measuresNestedGuideBoxes: true,
      measuresRestingDropdownBoxes: true,
      measuresUnderlineBoxes: true,
    });
  });
});

describe("SectionShellBackdropCanvas", () => {
  it("freezes backdrop measurement scale while viewport interaction is active", async () => {
    let renderCount = 0;

    function MeasurementScaleProbe() {
      const viewportInteractionActive = useReactFlow(
        (state) => state.viewportInteractionActive,
      );
      const measurementViewportScale = useBackdropMeasurementViewportScale(
        viewportInteractionActive,
      );
      renderCount += 1;

      return (
        <div
          data-testid="measurement-scale-probe"
          data-scale={measurementViewportScale}
        />
      );
    }

    useReactFlow.setState({
      transform: [0, 0, 1],
      viewportInteractionActive: false,
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(MeasurementScaleProbe));
    });

    const probe = host.querySelector('[data-testid="measurement-scale-probe"]');
    if (!(probe instanceof HTMLDivElement)) {
      throw new Error("Expected the measurement scale probe to render.");
    }

    expect(probe.dataset.scale).toBe("1");
    expect(renderCount).toBe(1);

    await act(async () => {
      useReactFlow.setState({ viewportInteractionActive: true });
    });

    expect(probe.dataset.scale).toBe("1");
    expect(renderCount).toBe(2);

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    expect(probe.dataset.scale).toBe("1");
    expect(renderCount).toBe(2);

    await act(async () => {
      useReactFlow.setState({ viewportInteractionActive: false });
    });

    expect(probe.dataset.scale).toBe("2");
    expect(renderCount).toBe(4);
  });

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
