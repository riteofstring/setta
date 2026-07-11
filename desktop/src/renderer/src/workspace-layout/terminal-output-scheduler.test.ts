import { describe, expect, test, vi } from "vitest";

import {
  TerminalOutputScheduler,
  TerminalPresentationScheduler,
} from "./terminal-output-scheduler";

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`missing ${description}`);
  }
  return value;
}

describe("TerminalOutputScheduler", () => {
  test("writes interactive output immediately and coalesces sustained output within one frame", () => {
    const frames: FrameRequestCallback[] = [];
    const microtasks: Array<() => void> = [];
    const write = vi.fn();
    const scheduler = new TerminalOutputScheduler<number>({
      cancelFrame: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      requestMicrotask: (callback) => microtasks.push(callback),
      write,
    });

    for (let value = 1; value <= 20; value += 1) {
      scheduler.enqueue(value);
    }

    expect(write).not.toHaveBeenCalled();
    microtasks[0]?.();
    expect(write).toHaveBeenCalledWith([
      { item: 1, outputSchedule: "immediate" },
      { item: 2, outputSchedule: "immediate" },
      { item: 3, outputSchedule: "immediate" },
      { item: 4, outputSchedule: "immediate" },
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    frames[0]?.(0);
    expect(write).toHaveBeenLastCalledWith(
      Array.from({ length: 16 }, (_, index) => ({
        item: index + 5,
        outputSchedule: "coalesced",
      })),
      expect.any(Function),
    );
    expect(write).toHaveBeenCalledTimes(2);
  });

  test("suppresses immediate admissions until the outstanding bulk write drains", () => {
    const frames: FrameRequestCallback[] = [];
    const microtasks: Array<() => void> = [];
    const write = vi.fn();
    const scheduler = new TerminalOutputScheduler<number>({
      cancelFrame: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      requestMicrotask: (callback) => microtasks.push(callback),
      write,
    });

    for (let value = 1; value <= 5; value += 1) {
      scheduler.enqueue(value);
    }
    required(microtasks[0], "initial immediate-write microtask")();
    required(frames[0], "initial bulk frame")(0);
    const completeFirstBulk = required(write.mock.calls[1], "first bulk write")[1] as () => void;

    scheduler.enqueue(6);
    required(frames[1], "suppressed bulk frame")(0);
    expect(write).toHaveBeenCalledTimes(2);

    completeFirstBulk();
    required(frames[2], "resumed bulk frame")(0);
    expect(write).toHaveBeenLastCalledWith(
      [{ item: 6, outputSchedule: "coalesced" }],
      expect.any(Function),
    );
    const completeSecondBulk = required(write.mock.calls[2], "second bulk write")[1] as () => void;
    completeSecondBulk();

    scheduler.enqueue(7);
    required(microtasks[1], "resumed immediate-write microtask")();
    expect(write).toHaveBeenLastCalledWith([{ item: 7, outputSchedule: "immediate" }]);
  });

  test("tags replay output with the recorded scheduler decision", () => {
    const frames: FrameRequestCallback[] = [];
    const write = vi.fn();
    const scheduler = new TerminalOutputScheduler<number>({
      cancelFrame: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return 1;
      },
      requestMicrotask: (callback) => queueMicrotask(callback),
      write,
    });

    scheduler.enqueueBulk([1, 2, 3]);
    frames[0]?.(0);
    expect(write).toHaveBeenCalledWith(
      [
        { item: 1, outputSchedule: "replay" },
        { item: 2, outputSchedule: "replay" },
        { item: 3, outputSchedule: "replay" },
      ],
      expect.any(Function),
    );
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
      requestMicrotask: (callback) => queueMicrotask(callback),
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
