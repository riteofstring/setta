/* @vitest-environment jsdom */

import type { GpuRetainedContentInteractionEvent } from "gpuFlow/interactions/retainedContentInteraction";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import { textLikeControlDescriptor } from "testUtils/projectGpuRetainedParamInteractionFixtures";
import { EMPTY_TEST_SCENE } from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import { describe, expect, it, vi } from "vitest";
import { getProjectRetainedContentInteractionOptions } from "./projectGpuRetainedParamInteractionAdapter";

describe("project GPU retained param interaction activation", () => {
  it("falls back to click activation for retained browser-control targets", () => {
    const onActiveParamCanvasControlChange = vi.fn();
    const onActiveParamDomIslandChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 40,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            ...textLikeControlDescriptor(""),
            renderOwner: "dom-owned",
          },
          controlKind: "text-like",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 160, x: 0, y: 0 },
    });
    const controlHit = retainedScene.hitRecords.find(
      (candidate) => candidate.kind === "control",
    );
    if (!controlHit) {
      throw new Error("Expected retained control hit.");
    }
    const options = getProjectRetainedContentInteractionOptions({
      canEditStructure: true,
      getActiveParamDomIsland: () => null,
      onActiveParamCanvasControlChange,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange: vi.fn(),
      onRetainedParamDragPreviewChange: vi.fn(),
      retainedContentScroll: {
        applyScrollOffsets: vi.fn(),
        getScene: () => EMPTY_TEST_SCENE,
        getScrollOffsets: () => new Map(),
      },
      retainedParamDragSessionRef: { current: null },
      zoomActivationKeyPressed: false,
    });

    options.onHitClick?.({
      flowPoint: { x: 120, y: 14 },
      hit: controlHit,
      localPoint: { x: 120, y: 14 },
      nativeEvent: new MouseEvent("pointerup", {
        clientX: 220,
        clientY: 96,
      }) as PointerEvent,
      ownerSectionId: "section-1",
      retainedScene,
      screenPoint: { x: 120, y: 14 },
      surfaceId: "section-1:param-content:unpinned",
      zIndex: 0,
    } satisfies GpuRetainedContentInteractionEvent);

    expect(onActiveParamDomIslandChange).toHaveBeenCalledWith(
      expect.objectContaining({
        activation: {
          clientPoint: { x: 220, y: 96 },
          kind: "pointer",
        },
      }),
    );
    expect(onActiveParamCanvasControlChange).toHaveBeenCalledWith(null);
    expect(onActiveParamCanvasControlChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ paramInfoId: "param-1" }),
    );
  });
});
