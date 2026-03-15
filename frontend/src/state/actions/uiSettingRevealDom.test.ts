// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRevealHighlight,
  findRevealSettingAnchor,
  normalizeRevealDurationMs,
  waitForRevealAnchorElement,
} from "./uiSettingRevealDom";

describe("uiSettingRevealDom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("finds anchors inside the pane root by data-setting-anchor", () => {
    const paneRoot = document.createElement("div");
    const anchor = document.createElement("div");
    anchor.dataset.settingAnchor = 'core.code."quoted"';
    paneRoot.append(anchor);

    const foundAnchor = findRevealSettingAnchor(paneRoot, 'core.code."quoted"');

    expect(foundAnchor).toBe(anchor);
  });

  it("waits for an anchor to appear in the active pane shell", async () => {
    const paneRoot = document.createElement("section");
    paneRoot.dataset.testid = "ui-editor-tab-content-shell";
    document.body.append(paneRoot);

    const waitPromise = waitForRevealAnchorElement({
      side: "right",
      anchorId: "core.code.section_variants",
      deadlineMs: Date.now() + 200,
      executionContext: null,
    });

    window.setTimeout(() => {
      const anchor = document.createElement("button");
      anchor.dataset.settingAnchor = "core.code.section_variants";
      paneRoot.append(anchor);
    }, 50);

    await vi.advanceTimersByTimeAsync(200);
    const anchor = await waitPromise;

    expect(anchor?.dataset.settingAnchor).toBe("core.code.section_variants");
  });

  it("applies and clears the reveal highlight class on a timer", () => {
    const anchor = document.createElement("div");

    applyRevealHighlight(anchor, 120);
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      true,
    );

    vi.advanceTimersByTime(120);
    expect(anchor.classList.contains("setta-ui-setting-reveal-highlight")).toBe(
      false,
    );
  });

  it("normalizes invalid and oversized reveal durations", () => {
    expect(normalizeRevealDurationMs(Number.NaN)).toBe(3000);
    expect(normalizeRevealDurationMs(-1)).toBe(3000);
    expect(normalizeRevealDurationMs(50_000)).toBe(10_000);
  });
});
