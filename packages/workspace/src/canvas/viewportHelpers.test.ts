import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceOptions } from "./options";
import { initialCanvasState, useReactFlow } from "./store";
import { resetZoom, zoomIn, zoomOut } from "./viewportHelpers";

function setupZoomRuntime() {
  const scaleBy = vi.fn();
  const scaleTo = vi.fn();
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
  const d3Zoom = { scaleBy, scaleTo } as unknown as NonNullable<typeof initialCanvasState.d3Zoom>;

  useReactFlow.setState({ ...initialCanvasState, d3Selection, d3Zoom });

  return { scaleBy, scaleTo, durations, transitionObject };
}

describe("viewport zoom helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
  });

  afterEach(() => {
    zoomIn.cancel();
    zoomOut.cancel();
    vi.useRealTimers();
    useWorkspaceOptions.getState().reset();
    useReactFlow.setState({ ...initialCanvasState });
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

  it("fails loud when zooming before the zoom pane initialized", () => {
    expect(() => resetZoom()).toThrowError("Cannot zoom before the zoom pane initialized.");
  });
});
