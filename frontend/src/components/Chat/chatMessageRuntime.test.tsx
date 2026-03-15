/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnimatedCountBadgeValue,
  resolveDurationLabel,
  useIdleStreamSpinner,
  useRunElapsedDuration,
} from "./chatMessageRuntime";

function IdleSpinnerProbe({
  shouldTrack,
  activityKey,
  delayMs,
}: {
  shouldTrack: boolean;
  activityKey: string;
  delayMs: number;
}) {
  const showSpinner = useIdleStreamSpinner(shouldTrack, activityKey, delayMs);
  return (
    <div
      data-testid="idle-spinner"
      data-visible={showSpinner ? "true" : "false"}
    />
  );
}

function RunElapsedDurationProbe({
  active,
  startedAtMs,
  completedAtMs,
  runKey,
}: {
  active: boolean;
  startedAtMs?: number | null;
  completedAtMs?: number | null;
  runKey?: string;
}) {
  const { elapsedMs, elapsedSeconds, hasKnownDuration } = useRunElapsedDuration(
    {
      active,
      startedAtMs,
      completedAtMs,
      runKey,
    },
  );
  return (
    <div
      data-testid="run-duration"
      data-elapsed-ms={String(elapsedMs)}
      data-elapsed-seconds={String(elapsedSeconds)}
      data-known-duration={hasKnownDuration ? "true" : "false"}
    />
  );
}

describe("chatMessageRuntime", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T17:00:00.000Z"));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(window.performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("delays the idle spinner until the stream has actually gone quiet", async () => {
    await act(async () => {
      root.render(
        <IdleSpinnerProbe
          shouldTrack={true}
          activityKey="activity-a"
          delayMs={1000}
        />,
      );
    });

    const spinner = host.querySelector('[data-testid="idle-spinner"]');
    if (!spinner) {
      throw new Error("Expected idle spinner probe.");
    }

    // The idle spinner should stay hidden until the full delay window passes.
    expect(spinner.getAttribute("data-visible")).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(spinner.getAttribute("data-visible")).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(spinner.getAttribute("data-visible")).toBe("true");

    await act(async () => {
      root.render(
        <IdleSpinnerProbe
          shouldTrack={true}
          activityKey="activity-b"
          delayMs={1000}
        />,
      );
    });

    // New activity should reset the delay instead of leaving a stale spinner visible.
    expect(spinner.getAttribute("data-visible")).toBe("false");
  });

  it("formats short completed durations without pretending they took a full second", () => {
    // Finished sub-second work should stay visibly distinct from a real 1s duration.
    expect(
      resolveDurationLabel({
        elapsedMs: 450,
        elapsedSeconds: 0,
        hasKnownDuration: true,
        isRunning: false,
      }),
    ).toBe("<1s");

    // Known multi-second work should still use the standard mm:ss label.
    expect(
      resolveDurationLabel({
        elapsedMs: 3_200,
        elapsedSeconds: 3,
        hasKnownDuration: true,
        isRunning: false,
      }),
    ).toBe("00:03");

    // Unknown durations must stay empty so the UI does not invent timing data.
    expect(
      resolveDurationLabel({
        elapsedMs: 0,
        elapsedSeconds: 0,
        hasKnownDuration: false,
        isRunning: false,
      }),
    ).toBeNull();
  });

  it("persists run timing across remounts once a tool run has completed", async () => {
    const initialNowMs = Date.now();
    const runKey = `persisted-tool-run-${Math.random().toString(36).slice(2)}`;

    await act(async () => {
      root.render(
        <RunElapsedDurationProbe
          active={true}
          startedAtMs={initialNowMs - 2_300}
          runKey={runKey}
        />,
      );
    });

    let duration = host.querySelector('[data-testid="run-duration"]');
    if (!duration) {
      throw new Error("Expected run duration probe.");
    }

    // Active runs should tick forward from the provided start time.
    expect(duration.getAttribute("data-known-duration")).toBe("true");
    expect(duration.getAttribute("data-elapsed-seconds")).toBe("2");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(duration.getAttribute("data-elapsed-seconds")).toBe("3");

    await act(async () => {
      root.render(
        <RunElapsedDurationProbe
          active={false}
          startedAtMs={initialNowMs - 2_300}
          completedAtMs={initialNowMs + 700}
          runKey={runKey}
        />,
      );
    });
    expect(duration.getAttribute("data-elapsed-seconds")).toBe("3");

    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);

    await act(async () => {
      root.render(<RunElapsedDurationProbe active={false} runKey={runKey} />);
    });

    duration = host.querySelector('[data-testid="run-duration"]');
    if (!duration) {
      throw new Error("Expected persisted run duration probe.");
    }

    // A remount should restore the persisted start/end snapshot for the same run key.
    expect(duration.getAttribute("data-known-duration")).toBe("true");
    expect(duration.getAttribute("data-elapsed-seconds")).toBe("3");
  });

  it("animates count badge transitions and then settles on the final value", async () => {
    await act(async () => {
      root.render(<AnimatedCountBadgeValue value={2} animateOnChange={true} />);
    });

    let badge = host.querySelector('[data-chat-count-badge-value="true"]');
    if (!badge) {
      throw new Error("Expected count badge.");
    }

    // Initial render should be static because there is no prior value to animate from.
    expect(badge.getAttribute("data-chat-count-badge-animating")).toBe("false");
    expect(badge.textContent?.trim()).toBe("2");

    await act(async () => {
      root.render(<AnimatedCountBadgeValue value={4} animateOnChange={true} />);
    });

    badge = host.querySelector('[data-chat-count-badge-value="true"]');
    if (!badge) {
      throw new Error("Expected animated count badge.");
    }

    // Value changes should expose the transient animated state while the badge counts up.
    expect(badge.getAttribute("data-chat-count-badge-animating")).toBe("true");

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    badge = host.querySelector('[data-chat-count-badge-value="true"]');
    if (!badge) {
      throw new Error("Expected settled count badge.");
    }

    // After the transition window, the badge should collapse back to a stable single value.
    expect(badge.getAttribute("data-chat-count-badge-animating")).toBe("false");
    expect(badge.textContent?.trim()).toBe("4");
  });
});
