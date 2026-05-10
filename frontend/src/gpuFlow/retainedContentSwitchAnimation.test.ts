import { describe, expect, it } from "vitest";

import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
  type GpuRetainedContentRowInput,
} from "./retainedContentScene";
import {
  createGpuRetainedContentSwitchAnimationStore,
  DEFAULT_SWITCH_TRANSITION_DURATION_MS,
  type GpuRetainedContentSwitchAnimationStore,
} from "./retainedContentSwitchAnimation";

describe("retained content switch animation store", () => {
  it("uses the default retained switch transition duration", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.syncSurface(surface({ checked: true }), 10);

    expect(DEFAULT_SWITCH_TRANSITION_DURATION_MS).toBe(140);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 80,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 150,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(1);
  });

  it("starts a thumb transition when a retained switch checked value changes", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 180,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 0,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0);

    store.syncSurface(surface({ checked: true }), 10);

    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 10,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 100,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
    expect(store.hasActiveSurface("surface-a", 100)).toBe(true);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 190,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(1);
    expect(store.hasActiveSurface("surface-a", 190)).toBe(false);
  });

  it("snaps switch changes when reduced motion is requested", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      prefersReducedMotion: () => true,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.syncSurface(surface({ checked: true }), 10);

    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 10,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(1);
    expect(store.hasActiveSurface("surface-a", 10)).toBe(false);
  });

  it("reverses from the current visual progress during rapid toggles", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.syncSurface(surface({ checked: true }), 20);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 70,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.25);

    store.syncSurface(surface({ checked: false }), 120);

    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 120,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 220,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.25);
    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 320,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0);
  });

  it("uses elapsed transition progress for reversal even before a draw resolves it", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.syncSurface(surface({ checked: true }), 20);
    store.syncSurface(surface({ checked: false }), 120);

    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 120,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
  });

  it("starts a transition from resolveProgress when drawing before surface sync", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);

    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 20,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 120,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
  });

  it("keeps an interaction-seeded transition while the scene still has the old checked value", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.beginTransition({
      fromChecked: false,
      nowMs: 20,
      rowId: "switch-param",
      surfaceId: "surface-a",
      toChecked: true,
    });

    expect(
      store.resolveProgress({
        checked: false,
        nowMs: 60,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.2);
    expect(
      store.resolveProgress({
        checked: true,
        nowMs: 120,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toBe(0.5);
  });

  it("keeps an interaction-seeded transition when surface sync sees the old scene before redraw", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.beginTransition({
      fromChecked: false,
      nowMs: 20,
      rowId: "switch-param",
      surfaceId: "surface-a",
      toChecked: true,
    });

    store.syncSurface(surface({ checked: false }), 40);

    expect(
      store.resolveVisualState({
        checked: false,
        nowMs: 60,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 0.2,
      targetChecked: true,
    });

    store.syncSurface(surface({ checked: true }), 80);

    expect(
      store.resolveVisualState({
        checked: true,
        nowMs: 120,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 0.5,
      targetChecked: true,
    });
  });

  it("keeps an interaction-seeded transition when an old scene frame returns after the target scene matched", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.beginTransition({
      fromChecked: false,
      nowMs: 20,
      rowId: "switch-param",
      surfaceId: "surface-a",
      toChecked: true,
    });

    store.syncSurface(surface({ checked: true }), 30);
    expect(
      store.resolveVisualState({
        checked: true,
        nowMs: 40,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 0.1,
      targetChecked: true,
    });

    store.syncSurface(surface({ checked: false }), 60);

    expect(
      store.resolveVisualState({
        checked: false,
        nowMs: 80,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 0.3,
      targetChecked: true,
    });
  });

  it("keeps the target visual active after the duration until the target scene arrives", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.beginTransition({
      fromChecked: false,
      nowMs: 20,
      rowId: "switch-param",
      surfaceId: "surface-a",
      toChecked: true,
    });
    store.syncSurface(surface({ checked: false }), 240);

    expect(
      store.resolveVisualState({
        checked: false,
        nowMs: 260,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 1,
      targetChecked: true,
    });
    expect(store.hasActiveSurface("surface-a", 260)).toBe(true);

    store.syncSurface(surface({ checked: true }), 280);
    expect(
      store.resolveVisualState({
        checked: true,
        nowMs: 280,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 1,
      targetChecked: true,
    });
    expect(store.hasActiveSurface("surface-a", 280)).toBe(true);

    store.settleCompletedSurfaceTransitions("surface-a", 280);
    expect(store.hasActiveSurface("surface-a", 280)).toBe(false);
  });

  it("reports the target checked state separately from delayed scene checked state", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      durationMs: 200,
      prefersReducedMotion: () => false,
    });

    store.syncSurface(surface({ checked: false }), 0);
    store.beginTransition({
      fromChecked: false,
      nowMs: 20,
      rowId: "switch-param",
      surfaceId: "surface-a",
      toChecked: true,
    });

    expect(
      store.resolveVisualState({
        checked: false,
        nowMs: 60,
        rowId: "switch-param",
        surfaceId: "surface-a",
      }),
    ).toEqual({
      progress: 0.2,
      targetChecked: true,
    });
  });

  it("returns the active switch source rect clipped to retained content bounds", () => {
    const store = createGpuRetainedContentSwitchAnimationStore({
      prefersReducedMotion: () => false,
    });
    const initialSurface = surface({
      checked: false,
      sourceClipOffset: { x: 0, y: 12 },
    });
    const toggledSurface = surface({
      checked: true,
      sourceClipOffset: { x: 0, y: 12 },
    });

    store.syncSurface(initialSurface, 0);
    store.syncSurface(toggledSurface, 10);

    expect(store.getActiveSurfaceSourceRect(toggledSurface)).toEqual({
      height: 12,
      width: 112,
      x: 108,
      y: 0,
    });
  });
});

function surface({
  checked,
  sourceClipOffset = { x: 0, y: 0 },
}: {
  readonly checked: boolean;
  readonly sourceClipOffset?: { readonly x: number; readonly y: number };
}): Parameters<GpuRetainedContentSwitchAnimationStore["syncSurface"]>[0] {
  return {
    id: "surface-a",
    rect: { height: 24, width: 220, x: 0, y: 0 },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("switch-param", {
          control: switchControl(checked),
          controlKind: "switch",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    }),
    sourceClipOffset,
  };
}

function row(
  id: string,
  overrides: Partial<GpuRetainedContentRowInput> = {},
): GpuRetainedContentRowInput {
  return {
    controlKind: "switch",
    depth: 0,
    id,
    label: id,
    ...overrides,
  };
}

function switchControl(
  checked: boolean,
): Extract<GpuRetainedContentControlDescriptor, { kind: "switch" }> {
  return {
    checked,
    defaultDisplayValue: "false",
    displayValue: checked ? "true" : "false",
    kind: "switch",
    rendererFamily: "switch",
    commitPolicy: "immediate",
  };
}
