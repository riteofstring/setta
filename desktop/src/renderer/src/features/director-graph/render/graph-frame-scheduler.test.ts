import { describe, expect, it } from "vitest";

import {
  GraphFrameScheduler,
  graphMaximumFrameDeltaSeconds,
  type GraphFrameOutcome,
  type GraphFrameTiming,
} from "./graph-frame-scheduler";

class FakeFrameSource {
  private pending: ((timestampMs: number) => void) | null = null;
  private nextHandle = 1;
  requests = 0;

  readonly host = {
    requestFrame: (callback: (timestampMs: number) => void): number => {
      this.requests += 1;
      this.pending = callback;
      return this.nextHandle++;
    },
    cancelFrame: (): void => {
      this.pending = null;
    },
  };

  pendingFrame(): boolean {
    return this.pending !== null;
  }

  /** Delivers one frame at `timestampMs`; throws when nothing was scheduled. */
  fire(timestampMs: number): void {
    const callback = this.pending;
    if (callback === null) {
      throw new Error("no frame was scheduled");
    }
    this.pending = null;
    callback(timestampMs);
  }
}

function scheduler(outcomes: readonly GraphFrameOutcome[]) {
  const source = new FakeFrameSource();
  const seen: GraphFrameTiming[] = [];
  let index = 0;
  const instance = new GraphFrameScheduler(source.host, (timing) => {
    seen.push(timing);
    const outcome = outcomes[Math.min(index, outcomes.length - 1)] ?? "idle";
    index += 1;
    return outcome;
  });
  return { source, seen, instance };
}

describe("graph frame scheduler", () => {
  it("draws nothing until something asks it to", () => {
    const { source, seen } = scheduler(["idle"]);
    expect(source.pendingFrame()).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("sleeps as soon as a frame reports nothing is moving", () => {
    const { source, instance, seen } = scheduler(["idle"]);
    instance.requestFrame();
    source.fire(0);
    expect(seen).toHaveLength(1);
    expect(source.pendingFrame()).toBe(false);
    expect(instance.isAwake()).toBe(false);
  });

  it("keeps drawing while a frame reports motion", () => {
    const { source, instance, seen } = scheduler(["continue", "continue", "idle"]);
    instance.requestFrame();
    source.fire(0);
    source.fire(8);
    source.fire(16);
    expect(seen).toHaveLength(3);
    expect(source.pendingFrame()).toBe(false);
  });

  it("coalesces repeated requests into one scheduled frame", () => {
    const { source, instance } = scheduler(["idle"]);
    instance.requestFrame();
    instance.requestFrame();
    instance.requestFrame();
    expect(source.requests).toBe(1);
  });

  it("resumes from the current clock instead of replaying the sleep", () => {
    const { source, instance, seen } = scheduler(["idle"]);
    instance.requestFrame();
    source.fire(0);
    instance.requestFrame();
    source.fire(60_000);
    const resumed = seen[1];
    expect(resumed).toBeDefined();
    expect(resumed?.deltaSeconds).toBe(0);
  });

  it("clamps a long frame so a stall does not fast-forward the graph", () => {
    const { source, instance, seen } = scheduler(["continue", "idle"]);
    instance.requestFrame();
    source.fire(0);
    source.fire(4000);
    expect(seen[1]?.deltaSeconds).toBe(graphMaximumFrameDeltaSeconds);
  });

  it("stops entirely while hidden and picks the request back up when shown", () => {
    const { source, instance, seen } = scheduler(["continue"]);
    instance.requestFrame();
    instance.setVisible(false);
    expect(source.pendingFrame()).toBe(false);
    instance.requestFrame();
    expect(source.pendingFrame()).toBe(false);
    instance.setVisible(true);
    expect(source.pendingFrame()).toBe(true);
    source.fire(1000);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.deltaSeconds).toBe(0);
  });

  it("resumes an active frame after hiding even when nothing changes while hidden", () => {
    const { source, instance, seen } = scheduler(["continue", "idle"]);
    instance.requestFrame();
    source.fire(0);
    expect(source.pendingFrame()).toBe(true);
    instance.setVisible(false);
    expect(source.pendingFrame()).toBe(false);
    instance.setVisible(true);
    expect(source.pendingFrame()).toBe(true);
    source.fire(10_000);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.deltaSeconds).toBe(0);
  });

  it("stays asleep after stop", () => {
    const { source, instance } = scheduler(["continue"]);
    instance.stop();
    instance.requestFrame();
    expect(source.pendingFrame()).toBe(false);
  });
});
