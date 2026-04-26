/* @vitest-environment jsdom */

import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { panCanvasFlowByWheel } from "./CanvasFlowInteractions";
import type { CanvasFlowViewport } from "./canvasFlowTypes";

describe("panCanvasFlowByWheel", () => {
  it("applies wheel deltas in screen space instead of scaling by zoom", () => {
    const viewportRef = {
      current: { x: 40, y: 80, zoom: 0.1 } satisfies CanvasFlowViewport,
    };
    const event = new WheelEvent("wheel", {
      deltaX: 12,
      deltaY: 30,
      deltaMode: 0,
    });
    const commitViewportChange = vi.fn();

    panCanvasFlowByWheel({
      commitViewportChange,
      event,
      panOnScrollMode: PanOnScrollModeEnum.free,
      panOnScrollSpeed: 2,
      viewportRef,
    });

    expect(viewportRef.current).toEqual({ x: 16, y: 20, zoom: 0.1 });
    expect(commitViewportChange).toHaveBeenCalledOnce();
  });
});
