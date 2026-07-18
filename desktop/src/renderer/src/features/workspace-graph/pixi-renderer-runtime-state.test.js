import { describe, expect, test } from "vitest";

import { createWorkflowGraphRuntimeState } from "./pixi-renderer-runtime-state";

describe("workflow graph renderer runtime state", () => {
  test("stops and restarts the ticker around focus and frozen state", () => {
    const events = [];
    const runtime = createRuntimeState(events);

    expect(runtime.setFocused(false)).toBe(true);
    runtime.syncTicker();
    expect(events).toContain("ticker.stop");

    expect(runtime.setFocused(true)).toBe(true);
    runtime.syncTicker();
    expect(events).toContain("ticker.startAt:42");
    expect(events).toContain("ticker.start");

    expect(runtime.setFrozen(true)).toBe(true);
    runtime.syncTicker();
    expect(events.at(-1)).toBe("ticker.stop");
  });

  test("uses frozen and focus state to gate viewport deceleration", () => {
    const events = [];
    const runtime = createRuntimeState(events);

    runtime.syncDeceleration(false);
    expect(events.at(-1)).toBe("decelerate.resume:decelerate");

    runtime.syncDeceleration(true);
    expect(events.at(-1)).toBe("decelerate.pause:decelerate");

    runtime.setFocused(false);
    runtime.syncDeceleration(false);
    expect(events.at(-1)).toBe("decelerate.pause:decelerate");

    runtime.setFocused(true);
    runtime.setFrozen(true);
    runtime.syncDeceleration(false);
    expect(events.at(-1)).toBe("decelerate.pause:decelerate");
  });

  test("toggles pointer events while frozen", () => {
    const events = [];
    const canvas = { style: { pointerEvents: "" } };
    const runtime = createRuntimeState(events, { canvas });

    expect(runtime.setFrozen(true)).toBe(true);
    expect(canvas.style.pointerEvents).toBe("none");
    expect(runtime.setFrozen(true)).toBe(false);

    expect(runtime.setFrozen(false)).toBe(true);
    expect(canvas.style.pointerEvents).toBe("");
  });
});

function createRuntimeState(events, { canvas = { style: { pointerEvents: "" } } } = {}) {
  const ticker = {
    started: false,
    start() {
      this.started = true;
      events.push("ticker.start");
    },
    stop() {
      this.started = false;
      events.push("ticker.stop");
    },
  };
  return createWorkflowGraphRuntimeState({
    canvas,
    now: () => 42,
    onTickerStart: (startedAt) => events.push(`ticker.startAt:${startedAt}`),
    ticker,
    viewportPlugins: {
      pause: (name) => events.push(`decelerate.pause:${name}`),
      resume: (name) => events.push(`decelerate.resume:${name}`),
    },
  });
}
