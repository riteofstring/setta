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
});
