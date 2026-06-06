import { describe, expect, test } from "vitest";

import {
  generateBenchmarkScene,
  phaseOneFakePaneCount,
  phaseOneVisiblePaneCount,
} from "./benchmark-scene";
import { NiriLikeLayoutEngine } from "./layout-engine";
import type { PaneRenderItem, PaneRuntimeState, Rect, SurfaceId, SurfaceKind } from "./types";

const viewport: Rect = {
  height: 900,
  width: 1440,
  x: 0,
  y: 0,
};

describe("niri browser-pane layout engine", () => {
  test("keeps the Phase 4 public surface contract explicit", () => {
    const runtimeState: PaneRuntimeState = "live";
    const surfaceId: SurfaceId = "niri_surface_contract";
    const surfaceKind: SurfaceKind = "browser";

    expect({ runtimeState, surfaceId, surfaceKind }).toEqual({
      runtimeState: "live",
      surfaceId: "niri_surface_contract",
      surfaceKind: "browser",
    });
  });

  test("generates the Phase 5 canvas-pane benchmark scene without losing browser panes", () => {
    const scene = generateBenchmarkScene();
    const browserPanes = scene.panes.filter((pane) => pane.surfaceKind === "browser");
    const pixiCanvasPanes = scene.panes.filter((pane) => pane.surfaceKind === "pixi-canvas");

    expect(scene.id).toBe("phase-5-canvas-pane-benchmark");
    expect(scene.totalPanes).toBe(phaseOneFakePaneCount);
    expect(scene.targetVisiblePanes).toBe(phaseOneVisiblePaneCount);
    expect(scene.visibleColumnCount).toBe(8);
    expect(scene.panesPerColumn).toBe(5);
    expect(scene.columns).toHaveLength(100);
    expect(scene.paneById.get("niri_pane_0")?.surfaceKind).toBe("fake-dom");
    expect(scene.paneById.get("niri_pane_1")?.surfaceKind).toBe("fake-long-chat");
    expect(scene.paneById.get("niri_pane_2")?.surfaceKind).toBe("settings-dom");
    expect(scene.paneById.get("niri_pane_3")?.surfaceKind).toBe("chat-dom");
    expect(scene.paneById.get("niri_pane_4")?.surfaceKind).toBe("pixi-canvas");
    expect(scene.panes.some((pane) => pane.surfaceKind === "fake-heavy-dom")).toBe(true);
    expect(scene.panes.some((pane) => pane.surfaceKind === "fake-canvas")).toBe(true);
    expect(pixiCanvasPanes.length).toBeGreaterThanOrEqual(4);
    expect(browserPanes.length).toBeGreaterThanOrEqual(20);
    expect(
      scene.panes
        .slice(0, phaseOneVisiblePaneCount)
        .filter((pane) => pane.surfaceKind === "browser"),
    ).toHaveLength(4);
  });

  test("renders a deterministic 40-pane frame from 500 fake panes", () => {
    const scene = generateBenchmarkScene();
    const engine = new NiriLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 0, "niri_pane_0");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]).toMatchObject({
      focused: true,
      paneId: "niri_pane_0",
      runtimeState: "live",
      surfaceKind: "fake-dom",
      visible: true,
      x: 10,
    });
    expect(items.at(-1)?.paneId).toBe("niri_pane_39");
  });

  test("uses scroll offset for transform-only horizontal movement", () => {
    const scene = generateBenchmarkScene();
    const engine = new NiriLikeLayoutEngine(scene);
    const items = renderFrame(engine, viewport, 4.25, "niri_pane_25");

    expect(items).toHaveLength(phaseOneVisiblePaneCount);
    expect(items[0]?.paneId).toBe("niri_pane_20");
    expect(items[0]?.x).toBeLessThan(0);
    expect(items.some((item) => item.focused && item.paneId === "niri_pane_25")).toBe(true);
    expect(new Set(items.map((item) => item.surfaceId)).size).toBe(phaseOneVisiblePaneCount);
  });
});

function renderFrame(
  engine: NiriLikeLayoutEngine,
  frameViewport: Rect,
  scrollColumn: number,
  focusedPaneId: string,
): PaneRenderItem[] {
  const items: PaneRenderItem[] = [];
  engine.renderFrame(
    {
      focusedPaneId,
      movementPhase: "moving",
      scrollColumn,
      viewport: frameViewport,
    },
    (item) => items.push(item),
  );
  return items;
}
