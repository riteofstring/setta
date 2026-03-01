import { describe, expect, it, vi } from "vitest";
import type { Transform } from "../types";
import { createRenderTransformScheduler } from "./renderTransformScheduler";

describe("renderTransformScheduler", () => {
  it("coalesces frame updates and applies only the latest transform", () => {
    let now = 0;
    let onFrame: (() => void) | null = null;
    const scheduleFrame = vi.fn((cb: () => void) => {
      onFrame = cb;
      return 1;
    });
    const cancelFrame = vi.fn();
    const applied: Transform[] = [];

    const scheduler = createRenderTransformScheduler({
      applyTransform: (transform) => {
        applied.push(transform);
      },
      cancelFrame,
      getNow: () => now,
      scheduleFrame,
    });

    scheduler.schedule([1, 2, 3]);
    scheduler.schedule([4, 5, 6]);

    expect(scheduleFrame).toHaveBeenCalledTimes(1);
    expect(applied).toEqual([]);

    now = 16;
    onFrame?.();

    expect(applied).toEqual([[4, 5, 6]]);
    expect(cancelFrame).not.toHaveBeenCalled();
  });

  it("flushes immediately and cancels any queued frame", () => {
    let now = 0;
    let onFrame: (() => void) | null = null;
    const scheduleFrame = vi.fn((cb: () => void) => {
      onFrame = cb;
      return 7;
    });
    const cancelFrame = vi.fn();
    const applied: Transform[] = [];

    const scheduler = createRenderTransformScheduler({
      applyTransform: (transform) => {
        applied.push(transform);
      },
      cancelFrame,
      getNow: () => now,
      scheduleFrame,
    });

    scheduler.schedule([1, 2, 3]);
    now = 5;
    scheduler.flush([9, 8, 7]);

    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(applied).toEqual([[9, 8, 7]]);

    onFrame?.();
    expect(applied).toEqual([[9, 8, 7]]);
  });

  it("cancels queued work without applying transforms", () => {
    let now = 0;
    const scheduleFrame = vi.fn(() => 99);
    const cancelFrame = vi.fn();
    const applied: Transform[] = [];

    const scheduler = createRenderTransformScheduler({
      applyTransform: (transform) => {
        applied.push(transform);
      },
      cancelFrame,
      getNow: () => now,
      scheduleFrame,
    });

    scheduler.schedule([3, 2, 1]);
    scheduler.cancel();

    expect(cancelFrame).toHaveBeenCalledWith(99);
    expect(applied).toEqual([]);
  });

  it("caps render updates to maxFps while still applying the latest pending transform", () => {
    let now = 0;
    const frameCallbacks = new Map<number, () => void>();
    let nextFrameId = 1;
    const scheduleFrame = vi.fn((cb: () => void) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(frameId, cb);
      return frameId;
    });
    const cancelFrame = vi.fn((frameId: number) => {
      frameCallbacks.delete(frameId);
    });
    const applied: Transform[] = [];

    const scheduler = createRenderTransformScheduler({
      applyTransform: (transform) => {
        applied.push(transform);
      },
      cancelFrame,
      getNow: () => now,
      maxFps: 60,
      scheduleFrame,
    });

    scheduler.flush([0, 0, 1]);
    scheduler.schedule([10, 20, 2]);

    now = 8;
    const firstFrame = frameCallbacks.get(1);
    firstFrame?.();
    frameCallbacks.delete(1);

    expect(applied).toEqual([[0, 0, 1]]);
    expect(scheduleFrame).toHaveBeenCalledTimes(2);

    now = 20;
    const secondFrame = frameCallbacks.get(2);
    secondFrame?.();

    expect(applied).toEqual([
      [0, 0, 1],
      [10, 20, 2],
    ]);
  });
});
