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
