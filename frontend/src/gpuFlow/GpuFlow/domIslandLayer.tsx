import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";

import { projectHtmlSurfaceActiveDomIsland } from "../htmlSurfaces/interactionProjector";
import type { GpuFlowPresentedSurfaceRuntime } from "../presentedSurfaceRuntime";
import type { GpuDomIsland } from "../scene";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  createGpuFlowBrowserVisualActorRuntime,
  getGpuFlowBrowserVisualActorRuntimeForPresentedSurface,
  type GpuFlowBrowserVisualActorRuntime,
} from "./browserVisualActorRuntime";
import { getGpuFlowVisibleFrameIdentityDataAttributes } from "./visibleFrameIdentityAttributes";
import type { GpuFlowVisibleFramePresentationToken } from "./visibleFramePresentationProofs";

export type GpuFlowDomIslandRenderer = (island: GpuDomIsland) => ReactNode;

const GPU_FLOW_DOM_ISLAND_CLASS_NAME = [
  "setta-gpu-flow__dom-island",
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
].join(" ");
const GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME = "setta-gpu-flow__dom-island-layer";

export function GpuFlowDomIslandLayer({
  presentedSurfaceRuntime,
  renderDomIsland,
  viewportStore,
  viewportRuntime,
}: {
  readonly presentedSurfaceRuntime?: GpuFlowPresentedSurfaceRuntime | undefined;
  readonly renderDomIsland: GpuFlowDomIslandRenderer | undefined;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportRuntime: GpuFlowViewportRuntime;
}) {
  const fallbackRuntimeRef = useRef<GpuFlowBrowserVisualActorRuntime | null>(
    null,
  );
  const browserVisualRuntime = useMemo(() => {
    if (presentedSurfaceRuntime) {
      return getGpuFlowBrowserVisualActorRuntimeForPresentedSurface(
        presentedSurfaceRuntime,
      );
    }
    fallbackRuntimeRef.current ??= createGpuFlowBrowserVisualActorRuntime();
    return fallbackRuntimeRef.current;
  }, [presentedSurfaceRuntime]);
  const snapshot = useSyncExternalStore(
    browserVisualRuntime.subscribe.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
    browserVisualRuntime.getSnapshot.bind(browserVisualRuntime),
  );
  const [preparationSnapshot, setPreparationSnapshot] = useState(() =>
    browserVisualRuntime.getPreparationSnapshot(),
  );
  const domIslands = snapshot.domIslands.islands;
  const presentationToken = snapshot.presentationToken;
  const visibleIslandIds = useMemo(
    () => new Set(domIslands.map((island) => island.id)),
    [domIslands],
  );
  const preparationDomIslands = useMemo(
    () =>
      preparationSnapshot.domIslands.islands.filter(
        (island) => !visibleIslandIds.has(island.id),
      ),
    [preparationSnapshot, visibleIslandIds],
  );
  const frameIds = snapshot.frameIds;

  const setDomIslandElement = useCallback(
    (
      islandId: string,
      element: HTMLElement | null,
      presentation: "preparation" | "visible",
      token: GpuFlowVisibleFramePresentationToken | null,
    ) => {
      browserVisualRuntime.setDomIslandElement({
        element,
        islandId,
        presentation,
        ...(token === null ? {} : { token }),
      });
    },
    [browserVisualRuntime],
  );
  useLayoutEffect(() => {
    browserVisualRuntime.setDomIslandProjectionEnvironment({
      viewportRuntime,
      viewportStore,
    });
  }, [browserVisualRuntime, viewportRuntime, viewportStore]);

  useLayoutEffect(() => {
    browserVisualRuntime.setDomIslandPreparationHostRenderer(
      setPreparationSnapshot,
    );
    return () => {
      browserVisualRuntime.setDomIslandPreparationHostRenderer(null);
    };
  }, [browserVisualRuntime]);

  useLayoutEffect(() => {
    return viewportRuntime.registerOverlayManager({
      applyViewport() {
        browserVisualRuntime.getSnapshot();
      },
    });
  }, [browserVisualRuntime, viewportRuntime]);

  const renderDomIslandContent = renderDomIsland;
  if (!renderDomIslandContent) {
    return null;
  }

  const normalizedViewport = normalizeGpuViewport(
    viewportRuntime.getViewportTuple(),
  );
  return (
    <div
      className={GPU_FLOW_DOM_ISLAND_LAYER_CLASS_NAME}
      data-gpu-flow-dom-island-prepared-content-frame-id={
        frameIds.preparedContentFrameId
      }
      data-gpu-flow-dom-island-layer="viewport"
      {...getGpuFlowVisibleFrameIdentityDataAttributes(presentationToken)}
    >
      {domIslands.map((island) => (
        <div
          className={GPU_FLOW_DOM_ISLAND_CLASS_NAME}
          data-gpu-flow-dom-island="true"
          data-gpu-flow-dom-island-id={island.id}
          data-gpu-flow-dom-island-kind={island.kind}
          key={island.id}
          ref={(element) =>
            setDomIslandElement(
              island.id,
              element,
              "visible",
              presentationToken,
            )
          }
          style={getGpuFlowDomIslandInitialStyle({
            island,
            viewport: normalizedViewport,
          })}
        >
          {renderDomIslandContent(island)}
        </div>
      ))}
      {preparationDomIslands.map((island) => (
        <div
          aria-hidden="true"
          className={GPU_FLOW_DOM_ISLAND_CLASS_NAME}
          data-gpu-flow-dom-island-preparation="true"
          data-gpu-flow-dom-island-id={island.id}
          data-gpu-flow-dom-island-kind={island.kind}
          key={`preparation:${island.id}`}
          ref={(element) =>
            setDomIslandElement(island.id, element, "preparation", null)
          }
          style={{
            ...getGpuFlowDomIslandInitialStyle({
              island,
              viewport: normalizedViewport,
            }),
            opacity: 0,
            pointerEvents: "none",
            transform: "translate3d(-100000px, -100000px, 0)",
            visibility: "hidden",
          }}
        >
          {renderDomIslandContent(island)}
        </div>
      ))}
    </div>
  );
}

function getGpuFlowDomIslandInitialStyle({
  island,
  viewport,
}: {
  readonly island: GpuDomIsland;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}) {
  return projectHtmlSurfaceActiveDomIsland({
    flowRect: island.rect,
    viewport,
    zIndex: island.zIndex,
  });
}
