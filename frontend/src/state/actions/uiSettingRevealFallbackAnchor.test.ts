// @vitest-environment jsdom

import type { UISettingRevealTarget } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealWithFallbackAnchor } from "./uiSettingRevealFallbackAnchor";

function createRevealTarget(
  overrides: Partial<UISettingRevealTarget>,
): UISettingRevealTarget {
  return {
    settingId: "core.watch_code.enabled",
    side: "left",
    overviewTabKey: "Overview",
    uiEditorTabName: null,
    pluginId: null,
    paneId: null,
    strategy: "dom_anchor",
    anchorId: "core.watch_code.enabled",
    pluginRevealKey: null,
    revealActivationSteps: [],
    ...overrides,
  };
}

describe("uiSettingRevealFallbackAnchor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    const windowRef = globalThis as unknown as {
      window: typeof globalThis & {
        matchMedia?: (query: string) => { matches: boolean };
      };
    };
    windowRef.window = globalThis;
    windowRef.window.matchMedia = vi.fn(() => ({ matches: false }));
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("appends the plugin failure detail when no fallback anchor exists", async () => {
    const status = await revealWithFallbackAnchor({
      target: createRevealTarget({ anchorId: null }),
      durationMs: 120,
      deadlineMs: Date.now() + 120,
      pluginRevealErrorMessage: "Plugin handler failed.",
      executionContext: null,
    });

    expect(status).toEqual({
      settingId: "core.watch_code.enabled",
      status: "failed",
      errorCode: "mutation_failed",
      errorMessage: "Plugin handler failed. No fallback anchorId is available.",
    });
  });

  it("scrolls to and highlights the fallback anchor when it is found", async () => {
    // Successful fallback reveals should use the shared DOM helpers but keep
    // the composed scroll/highlight behavior in one owner.
    const paneRoot = document.createElement("section");
    paneRoot.dataset.testid = "overview-tab-content-shell";
    const anchor = document.createElement("button");
    anchor.dataset.settingAnchor = "core.watch_code.enabled";
    anchor.scrollIntoView = vi.fn();
    paneRoot.append(anchor);
    document.body.append(paneRoot);

    const status = await revealWithFallbackAnchor({
      target: createRevealTarget({}),
      durationMs: 120,
      deadlineMs: Date.now() + 200,
      pluginRevealErrorMessage: null,
      executionContext: null,
    });

    expect(status).toEqual({
      settingId: "core.watch_code.enabled",
      status: "revealed",
      errorCode: null,
      errorMessage: null,
    });
    expect(anchor.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      true,
    );

    vi.advanceTimersByTime(120);
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      false,
    );
  });
});
