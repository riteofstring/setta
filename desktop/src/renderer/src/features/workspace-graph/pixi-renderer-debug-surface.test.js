import { describe, expect, test } from "vitest";

import { createWorkflowGraphDebugAnimationFrameRenderer } from "./pixi-renderer-debug-surface";

describe("workflow graph debug animation frame renderer", () => {
  test("holds the Pixi ticker during deterministic frame capture and releases it", () => {
    const ticks = [];
    const renderer = createWorkflowGraphDebugAnimationFrameRenderer({
      animationCoordinator: {
        tick: (now) => ticks.push(now),
      },
      animationState: {
        debugSnapshot: () => ({ animationActive: true }),
      },
      app: appStub({ started: false }),
      frameOwner: frameOwnerStub({ running: true }),
    });

    expect(renderer.renderAnimationFrame({ holdTicker: true, now: 123 })).toEqual({
      animationActive: true,
      frameOwnerHeld: true,
      frameOwnerRunning: false,
      now: 123,
      tickerHeld: true,
      tickerStarted: false,
    });
    expect(renderer.renderAnimationFrame({ holdTicker: true, now: 456 }).tickerStarted).toBe(false);
    expect(renderer.releaseAnimationFrame()).toEqual({
      frameOwnerHeld: false,
      frameOwnerRunning: true,
      tickerHeld: false,
      tickerStarted: false,
    });
    expect(ticks).toEqual([123, 456]);
  });

  test("renders without suspending the frame owner when no capture hold is requested", () => {
    const app = appStub({ started: false });
    const frameOwner = frameOwnerStub({ running: true });
    const renderer = createWorkflowGraphDebugAnimationFrameRenderer({
      animationCoordinator: {
        tick: () => {},
      },
      animationState: {
        debugSnapshot: () => ({ animationActive: true }),
      },
      app,
      frameOwner,
    });

    expect(renderer.renderAnimationFrame({ now: 789 })).toMatchObject({
      frameOwnerHeld: false,
      frameOwnerRunning: true,
      now: 789,
      tickerHeld: false,
      tickerStarted: false,
    });
    expect(app.ticker.stopCount).toBe(0);
    expect(frameOwner.suspendCount).toBe(0);
  });
});

function appStub({ started }) {
  const ticker = {
    startCount: 0,
    started,
    stopCount: 0,
    start() {
      this.started = true;
      this.startCount += 1;
    },
    stop() {
      this.started = false;
      this.stopCount += 1;
    },
  };
  return {
    render: () => {},
    ticker,
  };
}

function frameOwnerStub({ running }) {
  return {
    releaseCount: 0,
    running,
    suspendCount: 0,
    debugSnapshot() {
      return {
        frameOwnerRunning: this.running,
      };
    },
    release() {
      this.running = true;
      this.releaseCount += 1;
    },
    suspend() {
      this.running = false;
      this.suspendCount += 1;
    },
  };
}
