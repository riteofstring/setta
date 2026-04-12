/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SettingsGraphSubstrateCanaryBackground,
  resolveSettingsGraphSubstrateCanaryBackgroundPattern,
} from "./settingsGraphSubstrateCanaryBackground";

const hoisted = vi.hoisted(() => ({
  darkMode: false,
  settingsState: {
    gui: {
      gridColor: "#123456",
      gridColorDarkMode: "#abcdef",
      gridPattern: "lines",
      gridPatternSize: 4,
      snapGrid: [20, 30] as [number, number],
    },
  },
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: vi.fn(
    (selector: (state: { darkMode: boolean }) => unknown) =>
      selector({ darkMode: hoisted.darkMode }),
  ),
  useSettings: vi.fn(
    (selector: (state: typeof hoisted.settingsState) => unknown) =>
      selector(hoisted.settingsState),
  ),
}));

describe("settingsGraphSubstrateCanaryBackground", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.darkMode = false;
    hoisted.settingsState.gui.gridColor = "#123456";
    hoisted.settingsState.gui.gridColorDarkMode = "#abcdef";
    hoisted.settingsState.gui.gridPattern = "lines";
    hoisted.settingsState.gui.gridPatternSize = 4;
    hoisted.settingsState.gui.snapGrid = [20, 30];

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("derives the grid pattern from the canary viewport instead of the shared xyflow transform store", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryBackgroundPattern({
        gapXY: [20, 30],
        patternId: "pattern-a",
        patternSize: 4,
        variant: "dots",
        viewport: { x: 105, y: -55, zoom: 1.5 },
      }),
    ).toEqual({
      isCross: false,
      isDots: true,
      patternDimensions: [30, 45],
      patternId: "pattern-a",
      patternOffset: [3, 3],
      patternPosition: [15, -10],
      scaledGap: [30, 45],
      scaledSize: 6,
    });
  });

  it("renders the line pattern with canary-owned viewport math and the active theme color", async () => {
    hoisted.darkMode = true;
    hoisted.settingsState.gui.gridPattern = "cross";
    hoisted.settingsState.gui.gridPatternSize = 5;
    hoisted.settingsState.gui.snapGrid = [16, 24];

    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanaryBackground
          viewport={{ x: 48, y: -36, zoom: 2 }}
        />,
      );
    });

    const svg = host.querySelector("[data-testid='rf__background']");
    if (!(svg instanceof SVGSVGElement)) {
      throw new Error("Expected the canary background svg.");
    }

    const pattern = svg.querySelector("pattern");
    if (!pattern || pattern.tagName.toLowerCase() !== "pattern") {
      throw new Error("Expected the canary background pattern.");
    }

    expect(pattern.getAttribute("x")).toBe("16");
    expect(pattern.getAttribute("y")).toBe("-36");
    expect(pattern.getAttribute("width")).toBe("32");
    expect(pattern.getAttribute("height")).toBe("48");
    expect(pattern.getAttribute("patternTransform")).toBe("translate(-5,-5)");

    const path = pattern.querySelector("path");
    if (!path || path.tagName.toLowerCase() !== "path") {
      throw new Error("Expected the line pattern path.");
    }

    expect(path.getAttribute("stroke")).toBe("#abcdef");
    expect(path.getAttribute("stroke-width")).toBe("10");

    const rect = svg.querySelector("rect");
    if (!rect || rect.tagName.toLowerCase() !== "rect") {
      throw new Error("Expected the canary background rect.");
    }

    const fill = rect.getAttribute("fill");
    expect(fill).toMatch(/^url\(#graph-substrate-canary-background-/);
  });
});
