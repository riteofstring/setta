import { describe, expect, test } from "vitest";

import { generateBenchmarkScene } from "./benchmark-scene";
import { NiriMetricsCollector } from "./metrics";
import { PresentationEngine } from "./presentation-engine";
import { SurfaceRegistry } from "./surface-registry";
import type { NiriPane, PaneRenderItem, SurfaceAdapter } from "./types";

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

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", true)]);

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 001");
    expect(host.dataset.paneId).toBe("niri_pane_0");

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", false)]);

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

    presentation.apply([renderItem("niri_pane_8", "niri_surface_8", true, "browser")]);

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 009");
    expect(host.dataset.paneId).toBe("niri_pane_8");
    expect(host.dataset.surfaceKind).toBe("browser");
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
}

function setText(host: HTMLElement, selector: string, value: string): void {
  const target = host.querySelector(selector);
  if (target) {
    target.textContent = value;
  }
}
