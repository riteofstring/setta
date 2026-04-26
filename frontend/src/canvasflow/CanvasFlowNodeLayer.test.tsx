/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialState from "forks/xyflow/core/store/initialState";
import type { Node } from "forks/xyflow/core/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNodeInternals, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { CANVAS_FLOW_VIEWPORT_CHANGE_EVENT } from "utils/constants";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasFlowNodeLayer } from "./CanvasFlowNodeLayer";
import type {
  CanvasFlowNodeElementMap,
  CanvasFlowViewport,
} from "./canvasFlowTypes";

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: ({ sectionId }: { sectionId: string }) => (
    <div data-testid={`section-container-${sectionId}`} />
  ),
}));

const projectConfigId = "project-1";

describe("CanvasFlowNodeLayer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({
      ...initialState,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      transform: [0, 0, 1],
    });
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
    useReactFlow.setState({ ...initialState });
    vi.clearAllMocks();
  });

  it("updates mounted nodes from the live canvas viewport before ReactFlow transform syncs", async () => {
    seedProjectSections(["near", "far"]);
    useNodeInternals.setState({
      x: new Map([
        ["near", node("near", 0, 0)],
        ["far", node("far", 6000, 0)],
      ]),
    });
    const canvas = document.createElement("canvas");
    const canvasRef = { current: canvas };
    const nodeElementsRef = {
      current: new Map<string, HTMLElement>() as CanvasFlowNodeElementMap,
    };
    const viewportRef = {
      current: { x: 0, y: 0, zoom: 1 } satisfies CanvasFlowViewport,
    };

    await act(async () => {
      root.render(
        <CanvasFlowNodeLayer
          canvasCssSize={{ cssWidth: 800, cssHeight: 400 }}
          canvasRef={canvasRef}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={null}
          schedulePaint={vi.fn()}
          viewportRef={viewportRef}
        />,
      );
    });

    expect(container.querySelector('[data-id="near"]')).not.toBeNull();
    expect(container.querySelector('[data-id="far"]')).toBeNull();

    await act(async () => {
      viewportRef.current = { x: -6000, y: 0, zoom: 1 };
      window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
    });

    expect(useReactFlow.getState().transform).toEqual([0, 0, 1]);
    expect(container.querySelector('[data-id="near"]')).toBeNull();
    expect(container.querySelector('[data-id="far"]')).not.toBeNull();
  });

  it("keeps the mounted node set stable for small pans inside the overscan window", async () => {
    seedProjectSections(["near", "far"]);
    useNodeInternals.setState({
      x: new Map([
        ["near", node("near", 0, 0)],
        ["far", node("far", 3400, 0)],
      ]),
    });
    const canvas = document.createElement("canvas");
    const canvasRef = { current: canvas };
    const nodeElementsRef = {
      current: new Map<string, HTMLElement>() as CanvasFlowNodeElementMap,
    };
    const viewportRef = {
      current: { x: 0, y: 0, zoom: 1 } satisfies CanvasFlowViewport,
    };
    const schedulePaint = vi.fn();

    await act(async () => {
      root.render(
        <CanvasFlowNodeLayer
          canvasCssSize={{ cssWidth: 800, cssHeight: 400 }}
          canvasRef={canvasRef}
          nodeElementsRef={nodeElementsRef}
          resizeObserver={null}
          schedulePaint={schedulePaint}
          viewportRef={viewportRef}
        />,
      );
    });

    expect(container.querySelector('[data-id="near"]')).not.toBeNull();
    expect(container.querySelector('[data-id="far"]')).toBeNull();
    schedulePaint.mockClear();

    await act(async () => {
      viewportRef.current = { x: -300, y: 0, zoom: 1 };
      window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
    });

    expect(useReactFlow.getState().transform).toEqual([0, 0, 1]);
    expect(container.querySelector('[data-id="near"]')).not.toBeNull();
    expect(container.querySelector('[data-id="far"]')).toBeNull();
    expect(schedulePaint).not.toHaveBeenCalled();
  });
});

function seedProjectSections(sectionIds: string[]) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = {};
    state.sectionVariants = {};
    state.sectionImpls = {};
    state.projectConfig.sectionVariantMap = {};
    state.projectConfig.topLevelSections = {};
    state.parentSectionMap = {};
    state.previewSectionVariantMap = {};
    for (const [index, sectionId] of sectionIds.entries()) {
      const variantId = `${sectionId}-variant`;
      const implId = `${sectionId}-impl`;
      state.sections[sectionId] = createCore({
        id: sectionId,
        name: sectionId,
        variants: [variantId],
        defaultVariant: variantId,
      });
      state.sectionVariants[variantId] = createVariant({
        id: variantId,
        name: `${sectionId} Variant`,
        impl: implId,
        nonPresetImpls: [],
      });
      state.sectionImpls[implId] = createChatSectionImpl({
        id: implId,
        chatId: null,
        managed: true,
        engineConfigId: "engine-1",
      });
      state.projectConfig.sectionVariantMap[sectionId] = variantId;
      state.projectConfig.topLevelSections[sectionId] = {
        x: 0,
        y: 0,
        zIndex: index,
        w: null,
        h: null,
      };
      state.parentSectionMap[sectionId] = null;
    }
  });
}

function node(id: string, x: number, y: number): Node {
  return {
    id,
    position: { x, y },
    width: 200,
    height: 100,
    zIndex: 0,
    tempZIndex: 0,
  };
}
