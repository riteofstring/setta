import { describe, expect, it } from "vitest";

import { createInteractionRect } from "../src/internal/interaction-geometry.js";
import {
  resolveWorkspaceFreeformDestinationPlacement,
  resolveWorkspaceFreeformKeyboardMove,
  resolveWorkspaceFreeformPointerMove,
  workspaceFreeformMoveIndicator,
  workspaceFreeformMoveTransforms,
} from "../src/internal/workspace-section-freeform-movement.js";
import { refreshWorkspaceSectionFreeformRegion } from "../src/internal/workspace-section-move-regions.js";

const positions = {
  alpha: { x: 18, y: 24 },
  beta: { x: 68, y: 44 },
} as const;

describe("workspace same-parent freeform movement", () => {
  it("snaps the active child locally while preserving the selected block offsets", () => {
    const move = resolveWorkspaceFreeformPointerMove({
      activeSectionId: "alpha",
      delta: { x: 17, y: 11 },
      gridOptions: { snap: true, spacing: [20, 20] },
      positions,
      sectionIds: ["alpha", "beta"],
    });

    expect(move).toEqual({
      delta: { x: 22, y: 16 },
      positions: {
        alpha: { x: 40, y: 40 },
        beta: { x: 90, y: 60 },
      },
    });
  });

  it("translates the complete block when movement crosses either local start edge", () => {
    const move = resolveWorkspaceFreeformPointerMove({
      activeSectionId: "beta",
      delta: { x: -100, y: -80 },
      gridOptions: { snap: false, spacing: [20, 20] },
      positions,
      sectionIds: ["alpha", "beta"],
    });

    expect(move.delta).toEqual({ x: -18, y: -24 });
    expect(move.positions).toEqual({
      alpha: { x: 0, y: 0 },
      beta: { x: 50, y: 20 },
    });
  });

  it("advances to the next local grid line for keyboard movement", () => {
    expect(
      resolveWorkspaceFreeformKeyboardMove({
        activeSectionId: "alpha",
        direction: "right",
        gridOptions: { snap: true, spacing: [20, 20] },
        positions,
        sectionIds: ["alpha", "beta"],
      }),
    ).toEqual({
      delta: { x: 2, y: 0 },
      positions: {
        alpha: { x: 20, y: 24 },
        beta: { x: 70, y: 44 },
      },
    });
  });

  it("uses ten local units for keyboard movement when snapping is disabled", () => {
    expect(
      resolveWorkspaceFreeformKeyboardMove({
        activeSectionId: "alpha",
        direction: "down",
        gridOptions: { snap: false, spacing: [20, 20] },
        positions,
        sectionIds: ["alpha", "beta"],
      }),
    ).toEqual({
      delta: { x: 0, y: 10 },
      positions: {
        alpha: { x: 18, y: 34 },
        beta: { x: 68, y: 54 },
      },
    });
  });

  it("projects exact frame transforms and the matching workbench indicator", () => {
    const next = { alpha: { x: 30, y: 40 }, beta: { x: 80, y: 60 } };
    expect(workspaceFreeformMoveTransforms(positions, next, ["alpha", "beta"])).toEqual({
      alpha: { x: 12, y: 16 },
      beta: { x: 12, y: 16 },
    });
    expect(
      workspaceFreeformMoveIndicator(
        { height: 120, width: 220, x: 300, y: 180 },
        { x: -8, y: 4 },
        { x: 12, y: 16 },
      ),
    ).toEqual({ height: 120, width: 220, x: 304, y: 200 });
  });

  it("converts a measured block into snapped destination-local positions", () => {
    const placement = resolveWorkspaceFreeformDestinationPlacement({
      activeSectionId: "alpha",
      destinationBlockPosition: { x: 430, y: 230 },
      destinationSurfacePosition: { x: 400, y: 200 },
      gridOptions: { snap: true, spacing: [24, 24] },
      sectionIds: ["alpha", "beta"],
      sourceRects: {
        alpha: { height: 60, width: 80, x: 100, y: 50 },
        beta: { height: 70, width: 100, x: 220, y: 90 },
      },
      sourceWorkspaceBounds: { height: 110, width: 220, x: 100, y: 50 },
    });

    expect(placement).toEqual({
      indicator: { height: 110, width: 220, x: 424, y: 224 },
      positions: {
        alpha: { x: 24, y: 24 },
        beta: { x: 144, y: 64 },
      },
    });
  });

  it("translates a cross-parent block together at the destination start edges", () => {
    const placement = resolveWorkspaceFreeformDestinationPlacement({
      activeSectionId: "alpha",
      destinationBlockPosition: { x: 380, y: 190 },
      destinationSurfacePosition: { x: 400, y: 200 },
      gridOptions: { snap: false, spacing: [24, 24] },
      sectionIds: ["alpha", "beta"],
      sourceRects: {
        alpha: { height: 60, width: 80, x: 100, y: 50 },
        beta: { height: 70, width: 100, x: 220, y: 90 },
      },
      sourceWorkspaceBounds: { height: 110, width: 220, x: 100, y: 50 },
    });

    expect(placement).toEqual({
      indicator: { height: 110, width: 220, x: 400, y: 200 },
      positions: {
        alpha: { x: 0, y: 0 },
        beta: { x: 120, y: 40 },
      },
    });
  });

  it("refreshes destination and surface coordinates after intervening scrolling", () => {
    const element = {
      getBoundingClientRect: () => ({ height: 180, width: 300, x: 70, y: 100 }),
      isConnected: true,
    } as unknown as HTMLElement;
    const surface = {
      getBoundingClientRect: () => ({ height: 200, width: 400, x: 90, y: 120 }),
      isConnected: true,
    } as unknown as HTMLElement;
    const refreshed = refreshWorkspaceSectionFreeformRegion(
      {
        clientRect: createInteractionRect(0, 0, 0, 0),
        element,
        parentSectionId: "destination",
        surface,
        surfaceClientRect: createInteractionRect(0, 0, 0, 0),
        surfaceWorkspaceRect: { height: 0, width: 0, x: 0, y: 0 },
        workspaceRect: { height: 0, width: 0, x: 0, y: 0 },
      },
      {
        canvasBounds: { height: 600, width: 800, x: 10, y: 20 },
        viewport: { x: 30, y: 40, zoom: 2 },
      },
    );

    expect(refreshed).toMatchObject({
      clientRect: { height: 180, width: 300, x: 70, y: 100 },
      surfaceClientRect: { height: 200, width: 400, x: 90, y: 120 },
      surfaceWorkspaceRect: { height: 100, width: 200, x: 25, y: 30 },
      workspaceRect: { height: 90, width: 150, x: 15, y: 20 },
    });
  });
});
