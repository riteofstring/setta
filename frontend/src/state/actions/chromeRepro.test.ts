// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createChromeReproPerfTimer,
  postChromeReproEvent,
  postChromeReproPerfEvent,
  postMeasuredChromeReproEvent,
} from "./chromeRepro";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
  }
}

describe("chromeRepro", () => {
  afterEach(() => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = false;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not post when repro capture is inactive", () => {
    const postSpy = vi.spyOn(window, "postMessage");

    postChromeReproEvent("lsp-diagnostics", { changed: true });

    expect(postSpy).not.toHaveBeenCalled();
  });

  it("posts structured browser messages when repro capture is active", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    postChromeReproEvent("lsp-diagnostics", {
      changed: true,
      projectConfigId: "project-1",
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "setta.chrome-repro-recorder/app-state",
        type: "app-state",
        kind: "lsp-diagnostics",
        payload: {
          changed: true,
          projectConfigId: "project-1",
        },
      }),
      "*",
    );
  });

  it("posts perf-prefixed recorder messages", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    postChromeReproPerfEvent("websocket-message", {
      durationMs: 12,
    });

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "perf-websocket-message",
        payload: {
          durationMs: 12,
        },
      }),
      "*",
    );
  });

  it("records timer phases for perf events", () => {
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(15.25)
      .mockReturnValueOnce(22.5);

    const timer = createChromeReproPerfTimer("project-state-update", {
      messageType: "UpdateFrontendProjectState",
    });
    timer.mark("parse");
    timer.finish({ changed: true });

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "perf-project-state-update",
        payload: expect.objectContaining({
          changed: true,
          durationMs: 12.5,
          messageType: "UpdateFrontendProjectState",
          phases: [
            {
              durationMs: 5.3,
              label: "parse",
              sinceStartMs: 5.3,
            },
          ],
        }),
      }),
      "*",
    );
  });

  it("records measured event payload summaries", () => {
    vi.useFakeTimers();
    window.__SETTA_CHROME_REPRO_ACTIVE__ = true;
    const postSpy = vi.spyOn(window, "postMessage");

    const metric = postMeasuredChromeReproEvent(
      "gpu-flow-frame",
      { frame: 1, value: "x" },
      { buildDurationMs: 2.34 },
    );

    expect(metric).toEqual(
      expect.objectContaining({
        buildDurationMs: 2.3,
        payloadBytes: expect.any(Number),
      }),
    );
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "gpu-flow-frame",
        payload: { frame: 1, value: "x" },
      }),
      "*",
    );

    vi.advanceTimersByTime(1000);

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "chrome-repro-event-payload-summary",
        payload: {
          eventMetrics: [
            expect.objectContaining({
              buildDurationMsTotal: 2.3,
              count: 1,
              kind: "gpu-flow-frame",
            }),
          ],
        },
      }),
      "*",
    );
  });
});
