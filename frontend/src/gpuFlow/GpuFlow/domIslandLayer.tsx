import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import type { GpuDomIsland, GpuFlowScene } from "../scene";
import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuViewportInput,
} from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuFlowDomIslandRenderer = (island: GpuDomIsland) => ReactNode;

const GPU_FLOW_DOM_ISLAND_CLASS_NAME = [
  "setta-gpu-flow__dom-island",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");

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
    <>
      {domIslands.map((island) => (
        <div
          className={GPU_FLOW_DOM_ISLAND_CLASS_NAME}
          data-gpu-flow-dom-island="true"
          data-gpu-flow-dom-island-id={island.id}
          data-gpu-flow-dom-island-kind={island.kind}
          key={island.id}
          style={getGpuFlowDomIslandStyle(island, normalizedViewport)}
        >
          {renderDomIsland(island)}
        </div>
      ))}
    </>
  );
}

export function syncGpuFlowDomIslandElementStyle({
  element,
  island,
  viewport,
}: {
  readonly element: HTMLElement;
  readonly island: GpuDomIsland;
  readonly viewport: GpuViewportInput;
}) {
  const style = getGpuFlowDomIslandStyle(
    island,
    normalizeGpuViewport(viewport),
  );
  element.style.display = "";
  element.style.height = `${style.height}px`;
  element.style.left = `${style.left}px`;
  element.style.top = `${style.top}px`;
  element.style.transform = String(style.transform ?? "");
  element.style.width = `${style.width}px`;
  element.style.zIndex = String(style.zIndex ?? "");
}

export function hideGpuFlowDomIslandElement(element: HTMLElement) {
  element.style.display = "none";
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
