import { useReactFlow } from "forks/xyflow/core/store";
import { useMisc } from "state/definitions";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getViewportInteractionActiveValue,
  resetViewportInteractionState,
} from "./ZoomPane";

describe("getViewportInteractionActiveValue", () => {
  beforeEach(() => {
    useMisc.setState({ isPanScrolling: false });
    useReactFlow.setState({
      paneDragging: false,
      viewportInteractionActive: false,
    });
  });

  it("stays active while drag-pan is still running after pan-scroll settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("stays active while drag-pan is still running after a wheel-zoom burst settles", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: true,
      }),
    ).toBe(true);
  });

  it("turns inactive only after every gesture source is idle", () => {
    expect(
      getViewportInteractionActiveValue({
        isPanScrolling: false,
        isWheelZooming: false,
        isZoomingOrPanning: false,
      }),
    ).toBe(false);
  });

  it("clears global gesture flags during teardown", () => {
    const panScrollTimeout = { current: setTimeout(() => undefined, 1000) };
    const wheelZoomTimeout = { current: setTimeout(() => undefined, 1000) };
    useMisc.setState({ isPanScrolling: true });
    useReactFlow.setState({
      paneDragging: true,
      viewportInteractionActive: true,
    });

    resetViewportInteractionState({
      isPanScrolling: { current: true },
      isWheelZooming: { current: true },
      isZoomingOrPanning: { current: true },
      panScrollTimeout,
      wheelZoomTimeout,
    });

    expect(useMisc.getState().isPanScrolling).toBe(false);
    expect(useReactFlow.getState().viewportInteractionActive).toBe(false);
    expect(useReactFlow.getState().paneDragging).toBe(false);
  });
});
