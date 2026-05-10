import { describe, expect, it } from "vitest";

import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import { createGpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import { getGpuRetainedContentSwitchAnimationVisuals } from "./retainedContentSwitchVisuals";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

const SURFACE_ID = "dict-a:param-content:unpinned";
const ROW_ID = "param-switch";

describe("getGpuRetainedContentSwitchAnimationVisuals", () => {
  it("creates native switch visuals from the active animation state", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 100,
      prefersReducedMotion: () => false,
    });
    store.beginTransition({
      fromChecked: false,
      nowMs: 0,
      rowId: ROW_ID,
      surfaceId: SURFACE_ID,
      toChecked: true,
    });

    const quarterFrame = getGpuRetainedContentSwitchAnimationVisuals({
      darkMode: true,
      nowMs: 25,
      scene: flowScene(false),
      switchAnimations: store,
    });
    const halfFrame = getGpuRetainedContentSwitchAnimationVisuals({
      darkMode: true,
      nowMs: 50,
      scene: flowScene(false),
      switchAnimations: store,
    });

    expect(quarterFrame.map((visual) => visual.surfaceId)).toEqual([
      `${SURFACE_ID}:switch-animation:${ROW_ID}:track`,
      `${SURFACE_ID}:switch-animation:${ROW_ID}:thumb`,
    ]);
    expect(trackVisual(quarterFrame).color).toEqual({
      a: 1,
      b: 216 / 255,
      g: 78 / 255,
      r: 29 / 255,
    });
    expect(thumbVisual(halfFrame).rect.x).toBeGreaterThan(
      thumbVisual(quarterFrame).rect.x,
    );
    expect(thumbVisual(halfFrame).rect.x).toBeLessThan(
      trackVisual(halfFrame).rect.x + trackVisual(halfFrame).rect.width,
    );
  });

  it("keeps the same interpolated visual over the target scene", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 100,
      prefersReducedMotion: () => false,
    });
    store.beginTransition({
      fromChecked: false,
      nowMs: 0,
      rowId: ROW_ID,
      surfaceId: SURFACE_ID,
      toChecked: true,
    });

    const staleSceneFrame = getGpuRetainedContentSwitchAnimationVisuals({
      darkMode: true,
      nowMs: 50,
      scene: flowScene(false),
      switchAnimations: store,
    });
    const targetSceneFrame = getGpuRetainedContentSwitchAnimationVisuals({
      darkMode: true,
      nowMs: 50,
      scene: flowScene(true),
      switchAnimations: store,
    });

    expect(thumbVisual(targetSceneFrame).rect.x).toBe(
      thumbVisual(staleSceneFrame).rect.x,
    );
    expect(trackVisual(targetSceneFrame).color).toEqual(
      trackVisual(staleSceneFrame).color,
    );
  });

  it("keeps a native overlay on the completion frame before the texture can catch up", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 100,
      prefersReducedMotion: () => false,
    });
    store.beginTransition({
      fromChecked: false,
      nowMs: 0,
      rowId: ROW_ID,
      surfaceId: SURFACE_ID,
      toChecked: true,
    });
    store.syncSurface(retainedSurface(true), 100);

    const visuals = getGpuRetainedContentSwitchAnimationVisuals({
      darkMode: true,
      nowMs: 100,
      scene: flowScene(true),
      switchAnimations: store,
    });

    expect(visuals.map((visual) => visual.surfaceId)).toEqual([
      `${SURFACE_ID}:switch-animation:${ROW_ID}:track`,
      `${SURFACE_ID}:switch-animation:${ROW_ID}:thumb`,
    ]);
    store.settleCompletedSurfaceTransitions(SURFACE_ID, 100);
    expect(
      getGpuRetainedContentSwitchAnimationVisuals({
        darkMode: true,
        nowMs: 116,
        scene: flowScene(true),
        switchAnimations: store,
      }),
    ).toEqual([]);
  });

  it("returns no visuals when the switch is not actively animating", () => {
    expect(
      getGpuRetainedContentSwitchAnimationVisuals({
        darkMode: true,
        nowMs: 0,
        scene: flowScene(false),
        switchAnimations: createGpuRetainedContentSwitchAnimationStore(),
      }),
    ).toEqual([]);
  });
});

function flowScene(checked: boolean): GpuFlowScene {
  return {
    contentSurfaces: [retainedSurface(checked)],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface(checked: boolean): GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  const rect = { height: 96, width: 240, x: 12, y: 34 };
  return {
    clipRect: rect,
    id: SURFACE_ID,
    ownerSectionId: "dict-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: SURFACE_ID,
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: SURFACE_ID,
      ownerSectionId: "dict-a",
      rowHeight: 28,
      rows: [
        {
          control: switchControlDescriptor(checked),
          controlKind: "switch",
          depth: 0,
          id: ROW_ID,
          label: "Switch",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 240, x: 0, y: 0 },
    }),
    zIndex: 7,
  };
}

function switchControlDescriptor(checked: boolean) {
  return {
    checked,
    commitPolicy: "immediate" as const,
    defaultDisplayValue: String(checked),
    displayValue: String(checked),
    kind: "switch" as const,
    rendererFamily: "switch",
  };
}

function trackVisual(
  visuals: ReturnType<typeof getGpuRetainedContentSwitchAnimationVisuals>,
) {
  const visual = visuals.find((candidate) =>
    candidate.surfaceId.endsWith(":track"),
  );
  if (!visual) {
    throw new Error("Missing switch track visual.");
  }
  return visual;
}

function thumbVisual(
  visuals: ReturnType<typeof getGpuRetainedContentSwitchAnimationVisuals>,
) {
  const visual = visuals.find((candidate) =>
    candidate.surfaceId.endsWith(":thumb"),
  );
  if (!visual) {
    throw new Error("Missing switch thumb visual.");
  }
  return visual;
}
