import { describe, expect, it } from "vitest";
import { createGpuFlowViewportStore } from "./viewportStore";

describe("gpu viewport store", () => {
  it("owns connection preview state and clears active handles explicitly", () => {
    const store = createGpuFlowViewportStore();

    store.getState().setConnectionState({
      connectionPosition: { x: 10, y: 20 },
      connectionStartHandle: {
        handleId: "source-port",
        sectionId: "section-a",
        type: "source",
      },
      connectionStatus: "valid",
    });

    expect(store.getState().connectionPosition).toEqual({ x: 10, y: 20 });
    expect(store.getState().connectionStartHandle).toEqual({
      handleId: "source-port",
      sectionId: "section-a",
      type: "source",
    });
    expect(store.getState().connectionStatus).toBe("valid");

    store.getState().cancelConnection();

    expect(store.getState().connectionStartHandle).toBeNull();
    expect(store.getState().connectionEndHandle).toBeNull();
    expect(store.getState().connectionStatus).toBeNull();
    expect(store.getState().connectionPosition).toEqual({ x: 10, y: 20 });
  });

  it("owns keyboard activation state without changing unrelated flags", () => {
    const store = createGpuFlowViewportStore();

    store.getState().setSelectionKeyPressed(true);
    store.getState().setMultiSelectionActive(true);
    store.getState().setPanActivationKeyPressed(true);
    store.getState().setZoomActivationKeyPressed(true);
    store.getState().setMoveSectionActivationKeyPressed(true);

    expect(store.getState().selectionKeyPressed).toBe(true);
    expect(store.getState().multiSelectionActive).toBe(true);
    expect(store.getState().panActivationKeyPressed).toBe(true);
    expect(store.getState().zoomActivationKeyPressed).toBe(true);
    expect(store.getState().moveSectionActivationKeyPressed).toBe(true);
    expect(store.getState().viewportInteractionActive).toBe(false);

    store.getState().setSelectionKeyPressed(false);
    store.getState().setMultiSelectionActive(false);
    store.getState().setPanActivationKeyPressed(false);
    store.getState().setZoomActivationKeyPressed(false);
    store.getState().setMoveSectionActivationKeyPressed(false);

    expect(store.getState().selectionKeyPressed).toBe(false);
    expect(store.getState().multiSelectionActive).toBe(false);
    expect(store.getState().panActivationKeyPressed).toBe(false);
    expect(store.getState().zoomActivationKeyPressed).toBe(false);
    expect(store.getState().moveSectionActivationKeyPressed).toBe(false);
  });
});
