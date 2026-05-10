import { GpuFlow } from "gpuFlow/GpuFlow";
import { GPU_FLOW_SELECTORS } from "gpuFlow/gpuFlowDomClasses";
import {
  attachGpuEdgeInteractionController,
  type GpuEdgeInteractionEvent,
} from "gpuFlow/interactions/edges";
import { setViewport } from "gpuFlow/viewportActions";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import {
  createGpuFlowViewportStore,
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "gpuFlow/viewportStore";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useShareCapabilities } from "state/hooks/share";
import { AgenticScopeHighlightsUpdater } from "./AgenticScopeHighlightsUpdater";
import {
  selectProjectGpuEdge,
  useProjectGpuEdgeScene,
} from "./gpuProjectEdgeScene";
import { isProjectGpuEdgeInteractionDisabled } from "./gpuProjectInteractionGuards";
import { useProjectGpuLayoutAdapter } from "./GpuProjectSurface/projectGpuLayoutAdapter";

type GpuProjectEdgeLayerProps = {
  readonly showAgenticEdges: boolean;
  readonly showDataEdges: boolean;
};

type ProjectGpuEdgeSelectionEvent = Pick<
  GpuEdgeInteractionEvent,
  "edgeId" | "family"
>;

const GPU_PROJECT_EDGE_LAYER_STYLE: CSSProperties = {
  height: "100%",
  pointerEvents: "none",
  width: "100%",
};

export function GpuProjectEdgeLayer({
  showAgenticEdges,
  showDataEdges,
}: GpuProjectEdgeLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { nodeLayouts, scene } = useProjectGpuLayoutAdapter();
  const edgeScene = useProjectGpuEdgeScene({
    layoutNodes: nodeLayouts,
    scene,
    showAgenticEdges,
    showDataEdges,
  });
  const sceneRef = useRef(edgeScene);
  sceneRef.current = edgeScene;
  const viewport = useGpuFlowViewportStore((state) => state.transform);
  const viewportStore = useStableGpuFlowViewportStore();
  const { canEditStructure } = useShareCapabilities();
  const selectEdgeRef =
    useRef<(event: ProjectGpuEdgeSelectionEvent) => void>(noopSelectEdge);
  selectEdgeRef.current = (event) => {
    selectProjectGpuEdge({
      canEditStructure,
      event,
      multiSelect: gpuFlowViewportStore.getState().multiSelectionActive,
    });
  };

  useEffect(() => {
    setViewport(
      {
        x: viewport[0],
        y: viewport[1],
        zoom: viewport[2],
      },
      { store: viewportStore },
    );
  }, [viewport, viewportStore]);

  useEffect(() => {
    const host = hostRef.current;
    const pane = host?.closest(GPU_FLOW_SELECTORS.pane);
    if (!(pane instanceof HTMLElement)) {
      return;
    }
    return attachGpuEdgeInteractionController({
      element: pane,
      getScene: () => sceneRef.current,
      disabled: () => {
        const viewportState = gpuFlowViewportStore.getState();
        return isProjectGpuEdgeInteractionDisabled({
          connectionActive: viewportState.connectionStartHandle !== null,
          isFollowTransitioning: false,
          userSelectionActive: viewportState.userSelectionActive,
          viewportInteractionActive: viewportState.viewportInteractionActive,
        });
      },
      onEdgeClick: (event) => {
        selectEdgeRef.current(event);
      },
      onEdgeContextMenu: (event) => {
        selectEdgeRef.current(event);
      },
      store: viewportStore,
    });
  }, [viewportStore]);

  return (
    <>
      <AgenticScopeHighlightsUpdater />
      <div className="setta-project-gpu-edge-layer-host" ref={hostRef}>
        <GpuFlow
          className="setta-gpu-flow setta-project-gpu-edge-layer"
          edgeInteraction={false}
          edgeScene={edgeScene}
          nodeDrag={false}
          panZoom={false}
          selection={false}
          style={GPU_PROJECT_EDGE_LAYER_STYLE}
          viewport={viewport}
          viewportStore={viewportStore}
        />
      </div>
    </>
  );
}

function useStableGpuFlowViewportStore(): GpuFlowViewportStoreApi {
  return useMemo(() => createGpuFlowViewportStore(), []);
}

function noopSelectEdge() {}
