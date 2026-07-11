import { describe, expect, test, vi } from "vitest";

import {
  TerminalOutputScheduler,
  TerminalPresentationScheduler,
} from "./terminal-output-scheduler";

describe("TerminalOutputScheduler", () => {
  test("writes interactive output immediately and coalesces sustained output within one frame", () => {
    const frames: FrameRequestCallback[] = [];
    const write = vi.fn();
    const scheduler = new TerminalOutputScheduler<number>({
      cancelFrame: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      write,
    });

    for (let value = 1; value <= 20; value += 1) {
      scheduler.enqueue(value);
    }

    expect(write.mock.calls.slice(0, 4)).toEqual([[[1]], [[2]], [[3]], [[4]]]);
    expect(write).toHaveBeenCalledTimes(4);
    frames[0]?.(0);
    expect(write).toHaveBeenLastCalledWith([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(write).toHaveBeenCalledTimes(5);
  });

  test("coalesces replay output and cancels queued work on teardown", () => {
    const cancelFrame = vi.fn();
    const frames: FrameRequestCallback[] = [];
    const write = vi.fn();
    const scheduler = new TerminalOutputScheduler<number>({
      cancelFrame,
      requestFrame: (callback) => {
        frames.push(callback);
        return 7;
      },
      write,
    });

    scheduler.enqueueBulk([1, 2, 3]);
    expect(write).not.toHaveBeenCalled();
    scheduler.clear();
    expect(cancelFrame).toHaveBeenCalledWith(7);
    frames[0]?.(0);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("TerminalPresentationScheduler", () => {
  test("coalesces statistics and host presentation to one update per frame", () => {
    const frames: FrameRequestCallback[] = [];
    const present = vi.fn();
    const scheduler = new TerminalPresentationScheduler({
      cancelFrame: vi.fn(),
      present,
      requestFrame: (callback) => {
        frames.push(callback);
        return 1;
      },
    });

    scheduler.schedule(1);
    scheduler.schedule(8);
    scheduler.schedule(3);
    expect(frames).toHaveLength(1);
    expect(present).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(present).toHaveBeenCalledOnce();
    expect(present).toHaveBeenCalledWith(8);
  });
});
