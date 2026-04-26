import type { CanvasHTMLAttributes, MutableRefObject, RefObject } from "react";
import CanvasFlowNodeLayer from "./CanvasFlowNodeLayer";
import type { CanvasFlowNodeElementMap } from "./canvasFlowTypes";

type CanvasFlowCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  nodeElementsRef: MutableRefObject<CanvasFlowNodeElementMap>;
  resizeObserver: ResizeObserver | null;
  schedulePaint: () => void;
} & CanvasHTMLAttributes<HTMLCanvasElement>;

export function CanvasFlowCanvas({
  canvasRef,
  nodeElementsRef,
  resizeObserver,
  schedulePaint,
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
        nodeElementsRef={nodeElementsRef}
        resizeObserver={resizeObserver}
        schedulePaint={schedulePaint}
      />
    </canvas>
  );
}
