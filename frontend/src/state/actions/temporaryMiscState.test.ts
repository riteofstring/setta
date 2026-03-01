import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTemporaryMiscState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  flushQueuedTemporaryMiscStateUpdatesForTests,
  queueTemporaryMiscStateUpdate,
  resetQueuedTemporaryMiscStateUpdatesForTests,
} from "./temporaryMiscState";

describe("queueTemporaryMiscStateUpdate", () => {
  beforeEach(() => {
    resetProjectStores();
    resetQueuedTemporaryMiscStateUpdatesForTests();
  });

  afterEach(() => {
    resetQueuedTemporaryMiscStateUpdatesForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("coalesces multiple updates into one store write per frame", () => {
    const frameCallbacks: Array<FrameRequestCallback> = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => 0);
    const setStateSpy = vi.spyOn(useTemporaryMiscState, "setState");

    queueTemporaryMiscStateUpdate({ "height-a": 10 });
    queueTemporaryMiscStateUpdate({ "height-b": 20 });
    queueTemporaryMiscStateUpdate({ "height-a": 12 });

    expect(frameCallbacks).toHaveLength(1);
    expect(setStateSpy).not.toHaveBeenCalled();

    // Flush the queued frame callback exactly once.
    frameCallbacks[0](0);

    expect(setStateSpy).toHaveBeenCalledTimes(1);
    expect(useTemporaryMiscState.getState()).toMatchObject({
      "height-a": 12,
      "height-b": 20,
    });
  });

  it("skips store writes when queued values match current state", () => {
    useTemporaryMiscState.setState({ "height-a": 42 });
    const setStateSpy = vi.spyOn(useTemporaryMiscState, "setState");

    queueTemporaryMiscStateUpdate({ "height-a": 42 });

    // Ensure deterministic flush without waiting for animation frames.
    flushQueuedTemporaryMiscStateUpdatesForTests();

    expect(setStateSpy).not.toHaveBeenCalled();
    expect(useTemporaryMiscState.getState()).toMatchObject({
      "height-a": 42,
    });
  });
});
