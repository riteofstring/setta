import type { CanvasHTMLAttributes, MutableRefObject, RefObject } from "react";
import CanvasFlowNodeLayer from "./CanvasFlowNodeLayer";
import type {
  CanvasFlowNodeElementMap,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";

type ScheduleCanvasFlowTexturePaint = (
  reason?: string,
  nodeIds?: ReadonlySet<string> | "all",
) => void;
type ScheduleCanvasFlowLiveTextureRefresh = (
  reason: string,
  nodeIds: ReadonlySet<string>,
  durationMs?: number,
) => void;
type ScheduleCanvasFlowViewportFrame = (reason?: string) => void;

type CanvasFlowCanvasProps = {
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  scheduleLiveTextureRefresh: ScheduleCanvasFlowLiveTextureRefresh;
  scheduleTexturePaint: ScheduleCanvasFlowTexturePaint;
  scheduleViewportFrame: ScheduleCanvasFlowViewportFrame;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
} & CanvasHTMLAttributes<HTMLCanvasElement>;

export function CanvasFlowCanvas({
  canvasCssSize,
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  scheduleLiveTextureRefresh,
  scheduleTexturePaint,
  scheduleViewportFrame,
  viewportRef,
  ...canvasProps
}: CanvasFlowCanvasProps) {
  return (
    <canvas
      {...canvasProps}
      {...({ layoutsubtree: "" } as Record<string, string>)}
      className="canvas-flow__canvas"
      ref={canvasRef}
    >
      <CanvasFlowNodeLayer
        canvasCssSize={canvasCssSize}
        canvasRef={canvasRef}
        nodeElementsRef={nodeElementsRef}
        resizeObserver={resizeObserver}
        scheduleLiveTextureRefresh={scheduleLiveTextureRefresh}
        scheduleTexturePaint={scheduleTexturePaint}
        scheduleViewportFrame={scheduleViewportFrame}
        viewportRef={viewportRef}
      />
    </canvas>
  );
}
