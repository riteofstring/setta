/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  resolveSettingsGraphSubstrateCanarySectionDragEndPosition,
  resolveSettingsGraphSubstrateCanarySectionDragMovePosition,
  shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget,
  shouldBlockSettingsGraphSubstrateCanaryWheelTarget,
  shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget,
  shouldStartSettingsGraphSubstrateCanarySectionDrag,
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
    expect(
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target, {
        ctrlKey: false,
        isMacOs: true,
        isPanScrolling: false,
        zoomActivationKeyPressed: false,
        zoomOnPinch: true,
      }),
    ).toBe(false);
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
    expect(
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target, {
        ctrlKey: false,
        isMacOs: true,
        isPanScrolling: false,
        zoomActivationKeyPressed: false,
        zoomOnPinch: true,
      }),
    ).toBe(true);
  });

  it("keeps an active pan-scroll burst running across nowheel islands", () => {
    document.body.innerHTML = `
      <div data-testid="graph-substrate-canary-section">
        <div class="nowheel">
          <div id="target">Scrollable body</div>
        </div>
      </div>
    `;

    const target = document.getElementById("target");
    expect(target).not.toBeNull();
    expect(
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target, {
        ctrlKey: false,
        isMacOs: true,
        isPanScrolling: true,
        zoomActivationKeyPressed: false,
        zoomOnPinch: true,
      }),
    ).toBe(false);
  });

  it("allows modified-wheel zoom inside explicit nowheel islands", () => {
    document.body.innerHTML = `
      <div data-testid="graph-substrate-canary-section">
        <div class="nowheel">
          <div id="target">Scrollable body</div>
        </div>
      </div>
    `;

    const target = document.getElementById("target");
    expect(target).not.toBeNull();
    expect(
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target, {
        ctrlKey: false,
        isMacOs: true,
        isPanScrolling: false,
        zoomActivationKeyPressed: true,
        zoomOnPinch: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(target, {
        ctrlKey: true,
        isMacOs: true,
        isPanScrolling: false,
        zoomActivationKeyPressed: false,
        zoomOnPinch: true,
      }),
    ).toBe(false);
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

  it("does not start a drag until the pointer clears the node drag threshold", () => {
    expect(
      shouldStartSettingsGraphSubstrateCanarySectionDrag({
        currentScreenPoint: { x: 312, y: 308 },
        nodeDragThreshold: 15,
        originScreenPoint: { x: 300, y: 300 },
      }),
    ).toBe(false);
    expect(
      shouldStartSettingsGraphSubstrateCanarySectionDrag({
        currentScreenPoint: { x: 313, y: 308 },
        nodeDragThreshold: 15,
        originScreenPoint: { x: 300, y: 300 },
      }),
    ).toBe(true);
  });

  it("resolves section drag move positions from the latest pointer location", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionDragMovePosition({
        currentScreenPoint: { x: 420, y: 340 },
        originScreenPoint: { x: 300, y: 260 },
        originWorldPosition: { x: 613.2, y: 677.4 },
        zoom: 1,
      }),
    ).toEqual({
      x: 733.2,
      y: 757.4,
    });
  });

  it("scales section drag move positions by the active zoom", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionDragMovePosition({
        currentScreenPoint: { x: 420, y: 340 },
        originScreenPoint: { x: 300, y: 260 },
        originWorldPosition: { x: 613.2, y: 677.4 },
        zoom: 2,
      }),
    ).toEqual({
      x: 673.2,
      y: 717.4,
    });
  });

  it("keeps drag end positions unchanged when snap to grid is disabled", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionDragEndPosition(
        { x: 613.2, y: 677.4 },
        {
          snapGrid: [15, 15],
          snapToGrid: false,
        },
      ),
    ).toEqual({
      x: 613.2,
      y: 677.4,
    });
  });

  it("snaps drag end positions to the configured grid when enabled", () => {
    expect(
      resolveSettingsGraphSubstrateCanarySectionDragEndPosition(
        { x: 613.2, y: 677.4 },
        {
          snapGrid: [15, 15],
          snapToGrid: true,
        },
      ),
    ).toEqual({
      x: 615,
      y: 675,
    });
  });
});
