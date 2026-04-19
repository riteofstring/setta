import { memo, type ReactNode } from "react";
import { containerStyle } from "../styles";
import { useViewportTransformStyleRef } from "./useViewportTransformStyle";

type GraphSurfaceCameraLayerProps = {
  children: ReactNode;
};

function GraphSurfaceCameraLayer({
  children,
}: GraphSurfaceCameraLayerProps) {
  const { initialTransform, initialViewportInteractionActive, ref } =
    useViewportTransformStyleRef<HTMLDivElement>();

  return (
    <div
      className="react-flow__graph-surface-camera react-flow__container"
      data-viewport-interaction-active={initialViewportInteractionActive}
      ref={ref}
      style={{
        ...containerStyle,
        transform: initialTransform,
      }}
    >
      {children}
    </div>
  );
}

GraphSurfaceCameraLayer.displayName = "GraphSurfaceCameraLayer";

export default memo(GraphSurfaceCameraLayer);
