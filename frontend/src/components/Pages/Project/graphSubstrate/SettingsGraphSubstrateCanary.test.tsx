/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsGraphSubstrateCanary } from "./SettingsGraphSubstrateCanary";

const hoisted = vi.hoisted(() => ({
  controller: {
    draggingSectionId: null,
    finishPanePan: vi.fn(),
    handlePaneClick: vi.fn(),
    handlePanePointerDown: vi.fn(),
    handlePanePointerMove: vi.fn(),
    handlePaneWheel: vi.fn(),
    resolvedViewport: { x: 120, y: -80, zoom: 1.25 },
    rootCursor: "grab",
    rootRef: { current: null as HTMLDivElement | null },
    sceneSections: [{ sectionId: "section-a" }],
    sectionDragController: {
      cancelSectionDrag: vi.fn(),
      cleanup: vi.fn(),
      finishSectionDrag: vi.fn(),
      handleSectionPointerDown: vi.fn(),
      handleSectionPointerMove: vi.fn(),
    },
    shouldShowGridLines: true,
    viewportTransform: "translate(120px, -80px) scale(1.25)",
  },
}));

vi.mock("./settingsGraphSubstrateCanaryController", () => ({
  useSettingsGraphSubstrateCanaryController: vi.fn(() => hoisted.controller),
}));

vi.mock("./settingsGraphSubstrateCanaryBackground", () => ({
  SettingsGraphSubstrateCanaryBackground: vi.fn(
    ({ viewport }: { viewport: unknown }) => (
      <div
        data-testid="graph-substrate-canary-background"
        data-viewport={JSON.stringify(viewport)}
      />
    ),
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySectionsLayer", () => ({
  SettingsGraphSubstrateCanarySectionsLayer: vi.fn(
    ({ sceneSections }: { sceneSections: Array<{ sectionId: string }> }) => (
      <div
        data-testid="graph-substrate-canary-sections-layer"
        data-count={String(sceneSections.length)}
      />
    ),
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySectionShellPixiLayer", () => ({
  SettingsGraphSubstrateCanarySectionShellPixiLayer: vi.fn(
    ({
      sceneSections,
      viewport,
    }: {
      sceneSections: Array<{ sectionId: string }>;
      viewport: unknown;
    }) => (
      <div
        data-testid="graph-substrate-canary-section-pixi-layer"
        data-count={String(sceneSections.length)}
        data-viewport={JSON.stringify(viewport)}
      />
    ),
  ),
}));

describe("SettingsGraphSubstrateCanary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.controller.resolvedViewport = { x: 120, y: -80, zoom: 1.25 };
    hoisted.controller.sceneSections = [{ sectionId: "section-a" }];
    hoisted.controller.shouldShowGridLines = true;
    hoisted.controller.viewportTransform =
      "translate(120px, -80px) scale(1.25)";

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

  it("renders the substrate-owned background and sections layer from the controller state", async () => {
    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-background']")
        ?.getAttribute("data-viewport"),
    ).toBe(JSON.stringify(hoisted.controller.resolvedViewport));
    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-sections-layer']")
        ?.getAttribute("data-count"),
    ).toBe("1");
    expect(
      host
        .querySelector(
          "[data-testid='graph-substrate-canary-section-pixi-layer']",
        )
        ?.getAttribute("data-count"),
    ).toBe("1");
    expect(
      host
        .querySelector(
          "[data-testid='graph-substrate-canary-section-pixi-layer']",
        )
        ?.getAttribute("data-viewport"),
    ).toBe(JSON.stringify(hoisted.controller.resolvedViewport));

    const viewport = host.querySelector(
      "[data-testid='graph-substrate-canary-viewport']",
    );
    expect(viewport?.getAttribute("style")).toContain(
      "translate(120px, -80px) scale(1.25)",
    );
  });

  it("falls back to the empty-state copy when no sections are visible", async () => {
    hoisted.controller.shouldShowGridLines = false;
    hoisted.controller.sceneSections = [];

    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(
      host.querySelector("[data-testid='graph-substrate-canary-background']"),
    ).toBeNull();
    expect(
      host.querySelector(
        "[data-testid='graph-substrate-canary-sections-layer']",
      ),
    ).toBeNull();
    expect(
      host.querySelector(
        "[data-testid='graph-substrate-canary-section-pixi-layer']",
      ),
    ).toBeNull();
    expect(host.textContent).toContain(
      "No visible settings sections available for the graph substrate canary.",
    );
  });
});
