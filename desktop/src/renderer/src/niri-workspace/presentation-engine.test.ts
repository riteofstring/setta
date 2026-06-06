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

  test("can sync every rendered pane during movement for seamless workspace navigation", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
      null,
      { syncAllRenderedContentDuringMovement: true },
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", true)], {
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

  test("defers non-empty snapshot proxy content while panes are moving", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const registry = new RecordingSurfaceRegistry();
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      registry as unknown as SurfaceRegistry,
    );
    presentation.mount([host], null);

    presentation.apply(
      [renderItem("niri_pane_1", "niri_surface_1", true, "fake-heavy-dom", "snapshot")],
      { resizePhase: "idle" },
    );

    expect(host.dataset.paneId).toBe("niri_pane_0");
    expect(registry.syncedPaneIds).toEqual([]);
  });

  test("syncs focused pane content during movement", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply([{ ...renderItem("niri_pane_1", "niri_surface_1", true), focused: true }], {
      resizePhase: "idle",
    });

    expect(textFor(host, "[data-niri-pane-title]")).toBe("Pane 002");
    expect(host.dataset.paneId).toBe("niri_pane_1");
  });

  test("refills cleared hosts during movement instead of leaving empty pane shells", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001", 0);
    const registry = new RecordingSurfaceRegistry();
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      registry as unknown as SurfaceRegistry,
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_1", "niri_surface_1", true)], {
      resizePhase: "idle",
    });

    expect(host.dataset.paneId).toBe("niri_pane_1");
    expect(registry.syncedPaneIds).toEqual(["niri_pane_1"]);
  });

  test("restores opacity when a hidden host is reused for a visible pane", () => {
    const scene = generateBenchmarkScene({ paneCount: 1, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_0", "niri_surface_0", false)], {
      resizePhase: "idle",
    });
    presentation.apply([], { resizePhase: "idle" });
    presentation.apply([renderItem("niri_pane_0", "niri_surface_0", false)], {
      resizePhase: "idle",
    });

    expect(host.dataset.visible).toBe("true");
    expect(host.style.opacity).toBe("1.000");
    expect(host.style.pointerEvents).toBe("auto");
  });

  test("clears stale moving state when a host is hidden", () => {
    const scene = generateBenchmarkScene({ paneCount: 1, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_0", "niri_surface_0", true)], {
      resizePhase: "idle",
    });
    presentation.apply([], { resizePhase: "idle" });

    expect(host.dataset.moving).toBe("false");
    expect(host.dataset.focused).toBe("false");
    expect(host.dataset.visible).toBe("false");
  });

  test("prioritizes the focused pane when the host pool is saturated", () => {
    const scene = generateBenchmarkScene({ paneCount: 3, targetVisiblePanes: 2 });
    const firstHost = fakePaneHost("niri_pane_0", "Pane 001");
    const secondHost = fakePaneHost("niri_pane_1", "Pane 002");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([firstHost, secondHost], null);

    presentation.apply(
      [
        renderItem("niri_pane_0", "niri_surface_0", true),
        renderItem("niri_pane_1", "niri_surface_1", true),
        { ...renderItem("niri_pane_2", "niri_surface_2", true), focused: true },
      ],
      { resizePhase: "idle" },
    );

    expect([firstHost, secondHost].some((host) => host.dataset.paneId === "niri_pane_2")).toBe(
      true,
    );
    expect(
      [firstHost, secondHost].some(
        (host) => textFor(host, "[data-niri-pane-title]") === "Pane 003",
      ),
    ).toBe(true);
  });

  test("keeps pane content bound to pane identity while movement reorders render items", () => {
    const scene = generateBenchmarkScene({ paneCount: 2, targetVisiblePanes: 2 });
    const firstHost = fakePaneHost("niri_pane_0", "Pane 001");
    const secondHost = fakePaneHost("niri_pane_1", "Pane 002");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([firstHost, secondHost], null);

    presentation.apply(
      [
        renderItemAt("niri_pane_1", "niri_surface_1", true, 16),
        renderItemAt("niri_pane_0", "niri_surface_0", true, 220),
      ],
      { resizePhase: "idle" },
    );

    expect(textFor(firstHost, "[data-niri-pane-title]")).toBe("Pane 001");
    expect(firstHost.dataset.paneId).toBe("niri_pane_0");
    expect(firstHost.style.transform).toBe("translate3d(220.00px, 0.00px, 0) scale(1.000)");
    expect(textFor(secondHost, "[data-niri-pane-title]")).toBe("Pane 002");
    expect(secondHost.dataset.paneId).toBe("niri_pane_1");
    expect(secondHost.style.transform).toBe("translate3d(16.00px, 0.00px, 0) scale(1.000)");
  });

  test("disables host pointer events while a pane is shown as an overview texture", () => {
    const scene = generateBenchmarkScene({ paneCount: 1, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001", 0);
    const registry = new RecordingSurfaceRegistry();
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      registry as unknown as SurfaceRegistry,
    );
    presentation.mount([host], null);

    presentation.apply([renderItem("niri_pane_0", "niri_surface_0", false)], {
      resizePhase: "idle",
    });

    expect(host.style.pointerEvents).toBe("auto");

    presentation.apply(
      [
        {
          ...renderItem("niri_pane_0", "niri_surface_0", false, "fake-dom", "snapshot"),
          presentationMode: "overview",
        },
      ],
      { resizePhase: "idle" },
    );

    expect(host.dataset.presentationMode).toBe("overview");
    expect(host.style.pointerEvents).toBe("none");
  });

  test("adds pane maximize chrome and marks active maximized panes", () => {
    const scene = generateBenchmarkScene({ paneCount: 1, targetVisiblePanes: 1 });
    const host = fakePaneHost("niri_pane_0", "Pane 001");
    const presentation = new PresentationEngine(
      scene.panes,
      new NiriMetricsCollector(),
      new SurfaceRegistry(scene.panes, (pane) => new TitleSurfaceAdapter(pane)),
    );
    presentation.mount([host], null);

    presentation.apply(
      [{ ...renderItem("niri_pane_0", "niri_surface_0", false), maximized: true }],
      {
        resizePhase: "idle",
      },
    );

    const button = host.querySelector(".niri-pane-maximize-button") as HTMLButtonElement | null;

    expect(host.dataset.maximized).toBe("true");
    expect(button?.dataset.paneId).toBe("niri_pane_0");
    expect(button?.getAttribute("aria-label")).toBe("Restore pane size");
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

function fakePaneHost(paneId: string, title: string, childElementCount = 1): HTMLElement {
  const children = fakeChildren(childElementCount);
  const nodes = new Map<string, { textContent: string }>([
    ["[data-niri-pane-heat]", { textContent: "" }],
    ["[data-niri-pane-index]", { textContent: "1" }],
    ["[data-niri-pane-subtitle]", { textContent: "" }],
    ["[data-niri-pane-title]", { textContent: title }],
  ]);
  const host = {
    append: (child: FakeElement) => {
      children.push(child);
    },
    children,
    dataset: {
      paneId,
      ...(childElementCount > 0 ? { surfaceId: paneId.replace("_pane_", "_surface_") } : {}),
    },
    get childElementCount() {
      return children.length;
    },
    ownerDocument: {
      createElement: (tagName: string) => fakeElement(tagName),
    },
    querySelector: (selector: string) =>
      selector === ".niri-pane-maximize-button"
        ? (children.find((child) => child.classList.contains("niri-pane-maximize-button")) ?? null)
        : (nodes.get(selector) ?? null),
    removeAttribute: (name: string) => {
      delete (host.dataset as Record<string, string>)[name.replace(/^data-/, "")];
    },
    style: {},
  };
  return host as unknown as HTMLElement;
}

interface FakeElement {
  classList: {
    add: (value: string) => void;
    contains: (value: string) => boolean;
  };
  dataset: Record<string, string>;
  getAttribute: (name: string) => string | null;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
  title: string;
  type: string;
}

function fakeChildren(count: number): FakeElement[] {
  return Array.from({ length: count }, () => fakeElement("div"));
}

function fakeElement(tagName: string): FakeElement {
  const classNames = new Set<string>();
  const attributes = new Map<string, string>();
  attributes.set("data-tag-name", tagName);
  return {
    classList: {
      add: (value: string) => {
        classNames.add(value);
      },
      contains: (value: string) => classNames.has(value),
    },
    dataset: {},
    get className() {
      return [...classNames].join(" ");
    },
    set className(value: string) {
      classNames.clear();
      for (const className of value.split(/\s+/u)) {
        if (className.length > 0) {
          classNames.add(className);
        }
      }
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    remove: () => {},
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    title: "",
    type: "",
  } as FakeElement;
}

function renderItem(
  paneId: string,
  surfaceId: string,
  moving: boolean,
  surfaceKind: PaneRenderItem["surfaceKind"] = "fake-dom",
  runtimeState: PaneRenderItem["runtimeState"] = "live",
): PaneRenderItem {
  return {
    focused: false,
    height: 120,
    maximized: false,
    moving,
    opacity: 1,
    paneId,
    presentationMode: "normal",
    resizing: false,
    runtimeState,
    scale: 1,
    surfaceId,
    surfaceKind,
    visible: true,
    width: 160,
    x: 0,
    y: 0,
    z: 1,
  };
}

function renderItemAt(
  paneId: string,
  surfaceId: string,
  moving: boolean,
  x: number,
): PaneRenderItem {
  return {
    ...renderItem(paneId, surfaceId, moving),
    x,
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
    host.dataset.surfaceId = this.surfaceId;
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

class RecordingSurfaceRegistry {
  syncedPaneIds: string[] = [];

  canvasStats() {
    return {
      drawCalls: 0,
      farZoomSimplified: false,
      gpuMemoryEstimateBytes: null,
      liveCanvasPaneCount: 0,
      renderedFrames: 0,
    };
  }

  gitGraphStats() {
    return {
      completed: false,
      liveGraphPaneCount: 0,
      progress: 0,
      renderedEdges: 0,
      renderedNodes: 0,
      renderer: null,
      workerBatches: 0,
      workerPending: false,
    };
  }

  releaseHost(): void {}

  syncHost(_host: HTMLElement, item: PaneRenderItem) {
    this.syncedPaneIds.push(item.paneId);
    return {
      browserViewportWrites: 0,
      canvasViewportWrites: 0,
      deferredHeavyViewportWrites: 0,
      gitGraphViewportWrites: 0,
      heavyViewportWrites: 0,
      surfaceViewportWrites: 0,
      terminalViewportWrites: 0,
    };
  }

  teardown(): void {}

  terminalStats() {
    return {
      dirtyRows: 0,
      droppedOutputChunks: 0,
      liveTerminalRendererCount: 0,
      pendingOutputChunks: 0,
      renderedRows: 0,
      scrollbackRows: 0,
    };
  }
}

function setText(host: HTMLElement, selector: string, value: string): void {
  const target = host.querySelector(selector);
  if (target) {
    target.textContent = value;
  }
}
