import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { GpuDomIsland, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowDomIslandRenderer = (island: GpuDomIsland) => ReactNode;

export function GpuFlowDomIslandLayer({
  renderDomIsland,
  scene,
  viewportStore,
}: {
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
}) {
  const [viewport, setViewport] = useState<GpuViewportInput>(
    () => viewportStore.getState().transform,
  );

  useEffect(
    () =>
      viewportStore.subscribe((state, previousState) => {
        if (state.transform !== previousState.transform) {
          setViewport(state.transform);
        }
      }),
    [viewportStore],
  );

  const domIslands = scene?.domIslands ?? [];
  if (!renderDomIsland || domIslands.length === 0) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(viewport);
  return (
    <div className="setta-gpu-flow__dom-island-layer">
      {domIslands.map((island) => (
        <div
          className="setta-gpu-flow__dom-island"
          data-gpu-flow-dom-island="true"
          data-gpu-flow-dom-island-id={island.id}
          data-gpu-flow-dom-island-kind={island.kind}
          key={island.id}
          style={getGpuFlowDomIslandStyle(island, normalizedViewport)}
        >
          {renderDomIsland(island)}
        </div>
      ))}
    </div>
  );
}

function getGpuFlowDomIslandStyle(
  island: GpuDomIsland,
  viewport: ReturnType<typeof normalizeGpuViewport>,
): CSSProperties {
  const position = flowToScreenPosition(island.rect, viewport);
  return {
    height: island.rect.height,
    left: position.x,
    top: position.y,
    transform: `scale(${viewport.zoom})`,
    width: island.rect.width,
    zIndex: island.zIndex,
  };
}
