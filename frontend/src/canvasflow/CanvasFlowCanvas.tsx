import type { CanvasHTMLAttributes, MutableRefObject, RefObject } from "react";
import CanvasFlowNodeLayer from "./CanvasFlowNodeLayer";
import type {
  CanvasFlowNodeElementMap,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";

type CanvasFlowCanvasProps = {
  canvasCssSize: Pick<CanvasFlowSize, "cssHeight" | "cssWidth">;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
  viewportRef: MutableRefObject<CanvasFlowViewport>;
} & CanvasHTMLAttributes<HTMLCanvasElement>;

export function CanvasFlowCanvas({
  canvasCssSize,
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
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
        schedulePaint={schedulePaint}
        viewportRef={viewportRef}
      />
    </canvas>
  );
}
