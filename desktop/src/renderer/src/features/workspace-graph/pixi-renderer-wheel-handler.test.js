import { afterEach, describe, expect, test, vi } from "vitest";

import { createWorkflowGraphWheelHandler } from "./pixi-renderer-wheel-handler";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workflow graph wheel handler", () => {
  test("keeps diagnostics scalar and settles wheel bursts without per-event timer churn", () => {
    let time = 1000;
    let sequence = 0;
    let nextTimerId = 1;
    const timers = new Map();
    const setTimeout = vi.fn((callback, delayMs) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delayMs });
      return id;
    });
    const clearTimeout = vi.fn();
    vi.stubGlobal("window", { clearTimeout, setTimeout });

    const inputResponsiveness = {
      recordWheelCameraResult: vi.fn(),
      recordWheelEvent: vi.fn(() => {
        sequence += 1;
        return { sequence };
      }),
    };
    const onWheelBurstSettled = vi.fn();
    const panCameraByScreenDelta = vi.fn(() => true);
    const recordWheelPan = vi.fn();
    const recordWheelZoom = vi.fn();
    const zoomCameraAtScreen = vi.fn(() => true);
    const handler = createWorkflowGraphWheelHandler({
      canvas: canvasFixture(),
      inputResponsiveness,
      interactionsBlockWheel: () => false,
      now: () => time,
      onWheelBurstSettled,
      panCameraByScreenDelta,
      recordWheelPan,
      recordWheelZoom,
      zoomCameraAtScreen,
    });

    const firstEvent = wheelEvent({ clientX: 110, clientY: 80, deltaX: 3, deltaY: -4 });
    handler(firstEvent);
    time += 20;
    handler(wheelEvent({ clientX: 120, clientY: 90, deltaX: 5, deltaY: -6 }));
    time += 20;
    handler(wheelEvent({ clientX: 130, clientY: 100, deltaX: 7, deltaY: -8 }));

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(firstEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(firstEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(inputResponsiveness.recordWheelEvent).toHaveBeenCalledTimes(3);
    expect(inputResponsiveness.recordWheelEvent.mock.calls[0][1]).toEqual({
      canvasX: 50,
      canvasY: 30,
      deltaX: 3,
      deltaY: -4,
      eventNow: 1000,
      treatment: "pan",
    });
    expect(inputResponsiveness.recordWheelEvent.mock.calls[0][1]).not.toHaveProperty(
      "cameraBefore",
    );
    expect(inputResponsiveness.recordWheelCameraResult.mock.calls[0][0]).not.toHaveProperty(
      "cameraAfter",
    );
    expect(panCameraByScreenDelta).toHaveBeenCalledWith(3, -4, {
      interactionKind: "wheel-pan",
    });
    expect(recordWheelPan).toHaveBeenCalledTimes(3);
    expect(recordWheelZoom).not.toHaveBeenCalled();
    expect(zoomCameraAtScreen).not.toHaveBeenCalled();

    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(setTimeout.mock.calls[0][1]).toBe(140);
    expect(clearTimeout).not.toHaveBeenCalled();

    time = 1140;
    timers.get(1).callback();
    expect(setTimeout).toHaveBeenCalledTimes(2);
    expect(setTimeout.mock.calls[1][1]).toBe(40);
    expect(onWheelBurstSettled).not.toHaveBeenCalled();

    time = 1180;
    timers.get(2).callback();
    expect(onWheelBurstSettled).toHaveBeenCalledWith({
      eventCount: 3,
      treatment: "pan",
    });
    expect(clearTimeout).not.toHaveBeenCalled();
  });
});

function canvasFixture() {
  return {
    clientHeight: 100,
    clientWidth: 200,
    getBoundingClientRect: () => ({
      height: 200,
      left: 10,
      top: 20,
      width: 400,
    }),
  };
}

function wheelEvent({ clientX, clientY, deltaX, deltaY }) {
  return {
    altKey: false,
    clientX,
    clientY,
    ctrlKey: false,
    deltaMode: 0,
    deltaX,
    deltaY,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
    timeStamp: 990,
  };
}
