import { describe, expect, test } from "vitest";

import { generateBenchmarkScene } from "./benchmark-scene";
import { NiriMetricsCollector } from "./metrics";
import { PresentationEngine } from "./presentation-engine";
import { SurfaceRegistry } from "./surface-registry";
import type { CanvasSurfaceStats, NiriPane, PaneRenderItem, SurfaceAdapter } from "./types";

describe("niri presentation engine", () => {
  test("defers pane content writes while panes are moving", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", true)], {
      resizePhase: "idle",
    });

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 001");
    expect(host.dataset.paneId).toBe("niri_pane_0");

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", false)], {
      resizePhase: "idle",
    });

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 002");
    expect(host.dataset.paneId).toBe("niri_pane_1");
  });

  test("syncs browser surface content during movement so native bounds can update", () => {
    const scene = generateBenchmarkScene({ paneCount: 14, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_8", "niri_surface_8", true, "browser")], {
      resizePhase: "idle",
    });

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 009");
    expect(host.dataset.paneId).toBe("niri_pane_8");
    expect(host.dataset.surfaceKind).toBe("browser");
  });

  test("surfaces canvas draw stats in the debug overlay", () => {
    const scene = generateBenchmarkScene({ paneCount: 5, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const overlay = { textContent: "" } as HTMLElement;
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], overlay);

    presentation.apply([renderItem("niri_pane_4", "niri_surface_4", false, "pixi-canvas")], {
      resizePhase: "idle",
    });
    presentation.updateDebugOverlay({
      budget: {
        maxLiveBrowserPanes: 6,
        maxLiveHeavyDomPanes: 12,
        maxLiveTerminalRenderers: 8,
        maxLiveWebGpuCanvases: 4,
        maxSnapshotPanes: 64,
      },
      hidden: 0,
      live: 1,
      liveThrottled: 0,
      snapshot: 0,
      total: 1,
    });

    expect(overlay.textContent).toContain("canvas 1/7/512KiB");
  });
});

function fakePaneHost(paneId: string, title: string): HTMLElement {
  const nodes = new Map<string, { textContent: string }>([
    ["[data-niri-pane-heat]", { textContent: "" }],
    ["[data-niri-pane-index]", { textContent: "1" }],
    ["[data-niri-pane-subtitle]", { textContent: "" }],
    ["[data-niri-pane-title]", { textContent: title }],
  ]);
  const host = {
    dataset: { paneId },
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    removeAttribute: (name: string) => {
      delete (host.dataset as Record<string, string>)[name.replace(/^data-/, "")];
    },
    style: {},
  };
  return host as unknown as HTMLElement;
}

function renderItem(
  paneId: string,
  surfaceId: string,
  moving: boolean,
  surfaceKind: PaneRenderItem["surfaceKind"] = "fake-dom",
): PaneRenderItem {
  return {
    focused: false,
    height: 120,
    moving,
    opacity: 1,
    paneId,
    resizing: false,
    runtimeState: "live",
    surfaceId,
    surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: 1,
  };
}

function textFor(host: HTMLElement, selector: string): string {
  return host.querySelector(selector)?.textContent ?? "";
}

class TitleSurfaceAdapter implements SurfaceAdapter {
  readonly kind: NiriPane["surfaceKind"];
  readonly surfaceId: string;

  constructor(private readonly pane: NiriPane) {
    this.kind = pane.surfaceKind;
    this.surfaceId = pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    host.dataset.surfaceKind = this.kind;
    setText(host, "[data-niri-pane-title]", this.pane.title);
  }

  unmount(): void {}

  setVisible(): void {}

  setFocused(): void {}

  setViewport(): void {}

  freeze(): void {}

  resume(): void {}

  destroy(): void {}

  getCanvasStats(): CanvasSurfaceStats {
    if (this.kind !== "pixi-canvas") {
      return {
        drawCalls: 0,
        farZoomSimplified: false,
        gpuMemoryEstimateBytes: null,
        liveCanvasPaneCount: 0,
        renderedFrames: 0,
      };
    }
    return {
      drawCalls: 7,
      farZoomSimplified: false,
      gpuMemoryEstimateBytes: 512 * 1024,
      liveCanvasPaneCount: 1,
      renderedFrames: 3,
    };
  }
}

function setText(host: HTMLElement, selector: string, value: string): void {
  const target = host.querySelector(selector);
  if (target) {
    target.textContent = value;
  }
}
