import { memo, type ReactNode } from "react";
import { useReactFlow } from "../store";
import type { ReactFlowState } from "../types";
import { containerStyle } from "../styles";

const selector = (state: ReactFlowState) =>
  `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`;

type GraphSurfaceCameraLayerProps = {
  children: ReactNode;
};

function GraphSurfaceCameraLayer({
  children,
}: GraphSurfaceCameraLayerProps) {
  const transform = useReactFlow(selector);

  return (
    <div
      className="react-flow__graph-surface-camera react-flow__container"
      style={{
        ...containerStyle,
        transform,
      }}
    >
      {children}
    </div>
  );
}

GraphSurfaceCameraLayer.displayName = "GraphSurfaceCameraLayer";

export default memo(GraphSurfaceCameraLayer);
