import type { ReactNode } from "react";
import { GpuSurface, type GpuSurfaceProps } from "./GpuSurface";

export type GpuFlowProps = Pick<
  GpuSurfaceProps,
  "deviceOptions" | "onFrame" | "onPaint" | "onReady" | "onResize"
> & {
  children?: ReactNode;
};

export function GpuFlow({
  children,
  deviceOptions,
  onFrame,
  onPaint,
  onReady,
  onResize,
}: GpuFlowProps) {
  return (
    <div className="setta-gpu-flow" data-tab-scope="canvas">
      <GpuSurface
        deviceOptions={deviceOptions}
        onFrame={onFrame}
        onPaint={onPaint}
        onReady={onReady}
        onResize={onResize}
      >
        {children}
      </GpuSurface>
    </div>
  );
}
