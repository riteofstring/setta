/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget,
  shouldBlockSettingsGraphSubstrateCanaryWheelTarget,
  shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget,
} from "./settingsGraphSubstrateCanaryInteractions";

describe("settingsGraphSubstrateCanaryInteractions", () => {
  it("keeps wheel gestures enabled over ordinary section chrome", () => {
    document.body.innerHTML = `
      <div data-testid="graph-substrate-canary-section">
        <header>
          <button id="target" type="button">Section</button>
        </header>
      </div>
    `;

    const target = document.getElementById("target");
    expect(target).not.toBeNull();
    expect(
      shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget(target),
    ).toBe(true);
    expect(shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target)).toBe(
      false,
    );
    expect(
      shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget(target),
    ).toBe(false);
  });

  it("blocks wheel gestures inside explicit nowheel islands", () => {
    document.body.innerHTML = `
      <div data-testid="graph-substrate-canary-section">
        <div class="nowheel">
          <div id="target">Scrollable body</div>
        </div>
      </div>
    `;

    const target = document.getElementById("target");
    expect(target).not.toBeNull();
    expect(shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target)).toBe(
      true,
    );
  });

  it("ignores section drag starts on explicitly interactive descendants", () => {
    document.body.innerHTML = `
      <div data-testid="graph-substrate-canary-section">
        <div class="nodrag">
          <input id="target" />
        </div>
      </div>
    `;

    const target = document.getElementById("target");
    expect(target).not.toBeNull();
    expect(
      shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget(target),
    ).toBe(true);
  });
});
