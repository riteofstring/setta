// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  postChromeReproEvent,
  SETTA_CHROME_REPRO_MESSAGE_SOURCE,
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
        source: SETTA_CHROME_REPRO_MESSAGE_SOURCE,
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
});
