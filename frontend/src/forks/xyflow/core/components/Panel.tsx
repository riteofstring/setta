import cc from "classcat";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import type { GpuFlowViewportStore } from "gpuFlow/viewportStore";
import { type HTMLAttributes, type ReactNode } from "react";

type PanelPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  position: PanelPosition;
  children: ReactNode;
};

const selector = (s: GpuFlowViewportStore) =>
  s.userSelectionActive ? "none" : "all";

function Panel({ position, children, className, style, ...rest }: PanelProps) {
  const pointerEvents = useGpuFlowViewportStore(selector);
  const positionClasses = `${position}`.split("-");

  return (
    <div
      className={cc(["react-flow__panel", className, ...positionClasses])}
      style={{ ...style, pointerEvents }}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Panel;
