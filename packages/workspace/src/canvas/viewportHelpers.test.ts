import type { ZoomTransform } from "d3-zoom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveSections, useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import {
  focusWorkspaceSection,
  resetZoom,
  setCenter,
  shiftWorkspaceMapForLeadingPane,
  zoomIn,
  zoomOut,
} from "./viewportHelpers";

function setupZoomRuntime() {
  const scaleBy = vi.fn();
  const scaleTo = vi.fn();
  const transform = vi.fn();
  const durations: Array<number> = [];
  const transitionObject = { id: "transition" };
  const d3Selection = {
    transition: () => ({
      duration: (duration: number) => {
        durations.push(duration);
        return transitionObject;
      },
    }),
  } as unknown as NonNullable<typeof initialCanvasState.d3Selection>;
  const d3Zoom = { scaleBy, scaleTo, transform } as unknown as NonNullable<
    typeof initialCanvasState.d3Zoom
  >;

  useReactFlow.setState({ ...initialCanvasState, d3Selection, d3Zoom });

  return { d3Selection, scaleBy, scaleTo, transform, durations, transitionObject };
}

describe("viewport zoom helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useSectionRefs.getState().reset();
  });

  afterEach(() => {
    zoomIn.cancel();
    zoomOut.cancel();
    vi.useRealTimers();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
    useWorkspaceDocument.getState().reset();
    useActiveSections.getState().reset();
    useSectionRefs.getState().reset();
    vi.unstubAllGlobals();
  });

  it("zoomIn scales by 1.2 through a zero-duration transition", () => {
    const { scaleBy, durations, transitionObject } = setupZoomRuntime();

    zoomIn();

    expect(scaleBy).toHaveBeenCalledWith(transitionObject, 1.2);
    expect(durations).toEqual([0]);
  });

  it("zoomOut scales by 1/1.2", () => {
    const { scaleBy, transitionObject } = setupZoomRuntime();

    zoomOut();

    expect(scaleBy).toHaveBeenCalledWith(transitionObject, 1 / 1.2);
  });

  it("throttles repeated zoom commands to the 50ms window", () => {
    const { scaleBy } = setupZoomRuntime();

    zoomIn();
    zoomIn();
    expect(scaleBy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(scaleBy).toHaveBeenCalledTimes(2);
  });

  it("resetZoom scales to the default zoom level over a 100ms transition", () => {
    const { scaleTo, durations, transitionObject } = setupZoomRuntime();
    useWorkspaceOptions.setState({ defaultZoomLevel: 1.5 });

    resetZoom();

    expect(scaleTo).toHaveBeenCalledWith(transitionObject, 1.5);
    expect(durations).toEqual([100]);
  });

  it("matches frozen main's 100ms leading-pane map shift", () => {
    const { transform, durations, transitionObject } = setupZoomRuntime();
    useReactFlow.setState({ transform: [15, 25, 1.5] });

    shiftWorkspaceMapForLeadingPane(295);

    expect(transform).toHaveBeenCalledWith(
      transitionObject,
      expect.objectContaining({ x: 310, y: 25, k: 1.5 }),
    );
    expect(durations).toEqual([100]);
  });

  it("collapses requested camera transitions when reduced motion is requested", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { d3Selection, durations, scaleTo, transform } = setupZoomRuntime();
    useReactFlow.setState({ width: 800, height: 600 });

    resetZoom();
    setCenter(100, 50, { zoom: 2, duration: 120 });

    expect(durations).toEqual([]);
    expect(scaleTo).toHaveBeenCalledWith(d3Selection, 1);
    expect(transform).toHaveBeenCalledWith(d3Selection, expect.objectContaining({ k: 2 }));
  });

  it("does not schedule a zero-duration transition for reduced-motion centering", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });
    const { d3Selection, durations, transform } = setupZoomRuntime();
    useReactFlow.setState({ width: 800, height: 600 });

    setCenter(100, 50, { zoom: 2 });

    expect(durations).toEqual([]);
    expect(transform).toHaveBeenCalledWith(d3Selection, expect.objectContaining({ k: 2 }));
  });

  it("fails loud when zooming before the zoom pane initialized", () => {
    expect(() => resetZoom()).toThrowError("Cannot zoom before the zoom pane initialized.");
  });

  // The reference offsets the visible center by its Overview rail width; the package centers on
  // the canvas wrapper alone (the shared seam adaptation).
  it("setCenter centers the flow position on the canvas at the given zoom", () => {
    const { transform, durations, transitionObject } = setupZoomRuntime();
    useReactFlow.setState({ width: 800, height: 600 });

    setCenter(100, 50, { zoom: 2, duration: 120 });

    expect(transform).toHaveBeenCalledTimes(1);
    const [target, applied] = getFirstTransformCall(transform);
    expect(target).toBe(transitionObject);
    expect(applied.k).toBe(2);
    expect(applied.x).toBe(800 / 2 - 100 * 2);
    expect(applied.y).toBe(600 / 2 - 50 * 2);
    expect(durations).toEqual([120]);
  });

  it("setCenter defaults to the max zoom option", () => {
    const { transform } = setupZoomRuntime();
    useReactFlow.setState({ width: 800, height: 600 });
    useWorkspaceOptions.setState({ maxZoom: 4 });

    setCenter(0, 0);

    const [, applied] = getFirstTransformCall(transform);
    expect(applied.k).toBe(4);
    expect(applied.x).toBe(400);
    expect(applied.y).toBe(300);
  });

  it("focuses a mounted section at a maximum of 100% without changing selection", () => {
    const { transform, transitionObject, durations } = setupZoomRuntime();
    const section: WorkspaceSection = {
      id: "section-a",
      kind: "leaf",
      name: "Section A",
      size: { width: 200, height: 100 },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    };
    useWorkspaceDocument.setState({ sections: { "section-a": section } });
    useActiveSections.setState({ activeIds: ["section-a", "section-b"] });
    useWorkspaceOptions.setState({ minZoom: 2, maxZoom: 10 });
    useReactFlow.setState({
      width: 800,
      height: 600,
      domNode: {
        getBoundingClientRect: () => ({ x: 0, y: 0 }),
      } as unknown as HTMLDivElement,
    });
    useSectionRefs.setState({
      selfOnly: {
        "section-a": {
          clientWidth: 200,
          clientHeight: 100,
          getBoundingClientRect: () => ({ x: 100, y: 50 }),
        } as unknown as HTMLElement,
      },
    });

    focusWorkspaceSection("section-a");

    const [target, applied] = getFirstTransformCall(transform);
    expect(target).toBe(transitionObject);
    expect(applied.k).toBe(1);
    expect(applied.x).toBe(195);
    expect(applied.y).toBe(205);
    expect(durations).toEqual([50]);
    expect(useActiveSections.getState().activeIds).toEqual(["section-a", "section-b"]);
  });

  it("fails specifically for unknown and unmounted focus targets", () => {
    expect(() => focusWorkspaceSection("missing")).toThrowError(
      "Cannot focus unknown workspace section missing.",
    );
    useWorkspaceDocument.setState({
      sections: {
        known: {
          id: "known",
          kind: "leaf",
          name: "Known",
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
    });
    expect(() => focusWorkspaceSection("known")).toThrowError(
      "Cannot focus workspace section known before its canvas element mounted.",
    );
  });
});

function getFirstTransformCall(transform: ReturnType<typeof vi.fn>): [unknown, ZoomTransform] {
  const call = transform.mock.calls[0];
  if (!call) {
    throw new Error("d3Zoom.transform was not called.");
  }
  return [call[0], call[1] as ZoomTransform];
}
