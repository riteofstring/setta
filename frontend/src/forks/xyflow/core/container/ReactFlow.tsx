import Background from "forks/xyflow/background/Background";
import _ from "lodash";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { SceneGraphRendererLayer } from "sceneGraphRenderer/SceneGraphRendererLayer";
import {
  computeSceneGraphDomIslandSectionIds,
  findTopmostSceneOnlySectionAtFlowPosition,
} from "sceneGraphRenderer/domIslands";
import {
  computeSceneGraphSectionCompatibilitySnapshot,
  EMPTY_SCENE_GRAPH_SECTION_COMPATIBILITY_SNAPSHOT,
} from "sceneGraphRenderer/sectionCompatibility";
import { useSceneGraphRendererRuntime } from "sceneGraphRenderer/useSceneGraphRendererRuntime";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { useReactFlow } from "../store";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";
import EdgeRenderer from "./EdgeRenderer";
import FlowRenderer from "./FlowRenderer";
import NodeRenderer from "./NodeRenderer";
import ViewportWrapper from "./Viewport";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
  overflowAnchor: "none",
};

const SCROLL_INIT = 5000;
const EMPTY_DOM_ISLAND_SECTION_IDS = new Set<string>();
type SceneOnlyClickTarget = {
  sectionId: string;
  flowX: number;
  flowY: number;
  paneX: number;
  paneY: number;
};

const ReactFlow = () => {
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const projectConfigName = useProjectState(
    (state) => state.projectConfig.name,
  );
  const activeViewModeName = useProjectState((state) => {
    const activeViewModeId = state.projectConfig.activeViewModeId;
    if (!activeViewModeId) {
      return "";
    }
    const activeViewMode = state.projectConfig.viewModes[activeViewModeId];
    if (!activeViewMode) {
      return "";
    }
    return activeViewMode.name;
  });
  const sceneGraphRendererRuntime = useSceneGraphRendererRuntime({
    projectConfigId,
    projectConfigName,
    activeViewModeName,
  });
  const nodesById = useNodeInternals((state) => state.x);
  const edges = useProjectState((state) => state.projectConfig.edges);
  const sectionVariantMap = useProjectState(
    (state) => state.projectConfig.sectionVariantMap,
  );
  const activeIds = useProjectState((state) => state.projectConfig.activeIds);
  const sectionVariants = useProjectState((state) => state.sectionVariants);
  const sectionImpls = useProjectState((state) => state.sectionImpls);
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const wireColor = useSettings((x) => {
    // If the backend is running an older build, these fields can be missing.
    const gui = x.gui as unknown as {
      wireColor?: string;
      wireColorDarkMode?: string;
    };
    const light = gui.wireColor ?? "#41506c";
    const dark = gui.wireColorDarkMode ?? "#bac2d3";
    return darkMode ? dark : light;
  });
  const ref = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const wrapperDimensions = useWrapperDivDimensions(ref);
  const transform = useReactFlow((state) => state.transform);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef: ref,
    behavior: "canvas",
  });

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = SCROLL_INIT;
      ref.current.scrollLeft = SCROLL_INIT;
    }
    setInitialized(true);
  }, []);

  const readyToRender =
    wrapperDimensions.height > 0 && wrapperDimensions.width > 0;
  const sceneGraphPerfLabels = sceneGraphRendererRuntime.perfLabels;
  const renderSceneOnlySections =
    sceneGraphRendererRuntime.flags.enabled &&
    sceneGraphRendererRuntime.selection.resolvedBackend !== "dom";
  const focusedSectionId =
    activeIds.length > 0 ? activeIds[activeIds.length - 1] : null;
  const sectionCompatibilitySnapshot = useMemo(() => {
    if (!renderSceneOnlySections) {
      return EMPTY_SCENE_GRAPH_SECTION_COMPATIBILITY_SNAPSHOT;
    }
    return computeSceneGraphSectionCompatibilitySnapshot({
      nodesById,
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
    });
  }, [
    nodesById,
    renderSceneOnlySections,
    sectionImpls,
    sectionVariantMap,
    sectionVariants,
  ]);
  const domIslandSectionIds = useMemo(() => {
    if (!renderSceneOnlySections) {
      return EMPTY_DOM_ISLAND_SECTION_IDS;
    }
    const domIslandSectionIds = computeSceneGraphDomIslandSectionIds({
      nodesById,
      edges,
      sectionVariantMap,
      activeSectionIds: activeIds,
      focusedSectionId,
      domIslandRadius: sceneGraphRendererRuntime.flags.domIslandRadius,
    });
    if (sectionCompatibilitySnapshot.forcedDomSectionIds.size === 0) {
      return domIslandSectionIds;
    }
    const mergedSectionIds = new Set<string>(domIslandSectionIds);
    for (const sectionId of sectionCompatibilitySnapshot.forcedDomSectionIds) {
      mergedSectionIds.add(sectionId);
    }
    return mergedSectionIds;
  }, [
    activeIds,
    edges,
    focusedSectionId,
    nodesById,
    renderSceneOnlySections,
    sceneGraphRendererRuntime.flags.domIslandRadius,
    sectionCompatibilitySnapshot.forcedDomSectionIds,
    sectionVariantMap,
  ]);
  const sceneOnlyClickTarget = useMemo(() => {
    if (!renderSceneOnlySections) {
      return null;
    }
    return findFirstVisibleSceneOnlyClickTarget({
      nodesById,
      domIslandSectionIds,
      transform,
      wrapperDimensions,
    });
  }, [
    domIslandSectionIds,
    nodesById,
    renderSceneOnlySections,
    transform,
    wrapperDimensions,
  ]);

  return (
    <div
      style={
        {
          ...wrapperStyle,
          "--setta-wire-color": wireColor,
        } as CSSProperties
      }
      className="react-flow setta-light dark:setta-dark"
      ref={ref}
      onScroll={(e) => cancelOutScrolling(e, initialized)}
      data-tab-scope="canvas"
      data-show-agentic-edges={showAgenticEdges ? "true" : "false"}
      data-show-arg-edges={showArgEdges ? "true" : "false"}
      data-scene-graph-renderer-enabled={
        sceneGraphPerfLabels.enabled ? "1" : "0"
      }
      data-scene-graph-renderer-rollout-default-on={
        sceneGraphPerfLabels.rolloutDefaultOn ? "1" : "0"
      }
      data-scene-graph-renderer-rollout-default-on-reason={
        sceneGraphPerfLabels.rolloutDefaultOnReason
      }
      data-scene-graph-renderer-has-enabled-storage-override={
        sceneGraphPerfLabels.hasEnabledStorageOverride ? "1" : "0"
      }
      data-scene-graph-renderer-backend-requested={
        sceneGraphPerfLabels.requestedBackend
      }
      data-scene-graph-renderer-backend-resolved={
        sceneGraphPerfLabels.resolvedBackend
      }
      data-scene-graph-renderer-resolution-reason={
        sceneGraphPerfLabels.resolutionReason
      }
      data-scene-graph-renderer-probe-status={sceneGraphPerfLabels.probeStatus}
      data-scene-graph-renderer-webgpu-available={
        sceneGraphPerfLabels.webgpuAvailable ? "1" : "0"
      }
      data-scene-graph-renderer-webgpu-reason={
        sceneGraphPerfLabels.webgpuReason ?? ""
      }
      data-scene-graph-renderer-webgl2-available={
        sceneGraphPerfLabels.webgl2Available ? "1" : "0"
      }
      data-scene-graph-renderer-webgl2-reason={
        sceneGraphPerfLabels.webgl2Reason ?? ""
      }
      data-scene-graph-renderer-software-fallback={
        sceneGraphPerfLabels.softwareFallbackDetected ? "1" : "0"
      }
      data-scene-graph-renderer-software-fallback-reasons={sceneGraphPerfLabels.softwareFallbackReasons.join(
        ",",
      )}
      data-scene-graph-renderer-dom-island-radius={String(
        sceneGraphPerfLabels.domIslandRadius,
      )}
      data-scene-graph-renderer-debug-overlay={
        sceneGraphPerfLabels.debugOverlay ? "1" : "0"
      }
      data-scene-graph-renderer-dom-islands-active={
        renderSceneOnlySections ? "1" : "0"
      }
      data-scene-graph-renderer-dom-island-count={String(
        domIslandSectionIds.size,
      )}
      data-scene-graph-renderer-scene-compatible-section-count={String(
        sectionCompatibilitySnapshot.sceneCompatibleSectionCount,
      )}
      data-scene-graph-renderer-dom-only-section-count={String(
        sectionCompatibilitySnapshot.domOnlySectionCount,
      )}
      data-scene-graph-renderer-unresolved-section-count={String(
        sectionCompatibilitySnapshot.unresolvedSectionCount,
      )}
      data-scene-graph-renderer-forced-dom-section-count={String(
        sectionCompatibilitySnapshot.forcedDomSectionIds.size,
      )}
      data-scene-graph-renderer-scene-only-click-target-section-id={
        sceneOnlyClickTarget?.sectionId ?? ""
      }
      data-scene-graph-renderer-scene-only-click-target-flow-x={
        sceneOnlyClickTarget ? String(sceneOnlyClickTarget.flowX) : ""
      }
      data-scene-graph-renderer-scene-only-click-target-flow-y={
        sceneOnlyClickTarget ? String(sceneOnlyClickTarget.flowY) : ""
      }
      data-scene-graph-renderer-scene-only-click-target-pane-x={
        sceneOnlyClickTarget ? String(sceneOnlyClickTarget.paneX) : ""
      }
      data-scene-graph-renderer-scene-only-click-target-pane-y={
        sceneOnlyClickTarget ? String(sceneOnlyClickTarget.paneY) : ""
      }
    >
      {/* The purpose of this div is to allow us to set scrollTop and scrollLeft to a large initial value*/}
      {/* so that onScroll can be triggered in any direction. */}
      {/* That way, we can leverage the browser's scroll behavior in any direction, if we want to. */}
      <div
        style={{
          position: "relative",
          height: `${SCROLL_INIT}px`,
          width: `${SCROLL_INIT}px`,
          top: `${SCROLL_INIT}px`,
          left: `${SCROLL_INIT}px`,
        }}
      >
        <SceneGraphRendererLayer
          runtime={sceneGraphRendererRuntime}
          wrapperDimensions={wrapperDimensions}
          wireColor={wireColor}
          darkMode={darkMode}
        />
        <FlowRenderer
          wrapperDimensions={wrapperDimensions}
          renderSceneOnlySections={renderSceneOnlySections}
          domIslandSectionIds={domIslandSectionIds}
        >
          <ViewportWrapper>
            {readyToRender && (
              <>
                <EdgeRenderer />
                <AgenticEdgeRenderer />
                <NodeRenderer
                  renderSceneOnlySections={renderSceneOnlySections}
                  domIslandSectionIds={domIslandSectionIds}
                />
              </>
            )}
          </ViewportWrapper>
        </FlowRenderer>
        {snapToGrid && showGridLines && <Background />}
      </div>
    </div>
  );
};

function cancelOutScrolling(e: UIEvent<HTMLDivElement>, initialized: boolean) {
  if (!initialized) {
    return;
  }
  const { d3Zoom, d3Selection, transform } = useReactFlow.getState();
  d3Zoom!.translateBy(
    d3Selection!,
    -(e.currentTarget.scrollLeft - SCROLL_INIT) / transform[2],
    -(e.currentTarget.scrollTop - SCROLL_INIT) / transform[2],
  );
  e.currentTarget.scrollTop = SCROLL_INIT;
  e.currentTarget.scrollLeft = SCROLL_INIT;
}

function useWrapperDivDimensions(ref: RefObject<HTMLDivElement>) {
  const { overviewWidth, uiEditorWidth } = useLocalStorage(
    (x) => ({
      overviewWidth: x.overviewTrueWidth,
      uiEditorWidth: x.uiEditorTrueWidth,
    }),
    _.isEqual,
  );

  const [wrapperDimensions, setWrapperDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    let resizeObserver: ResizeObserver;

    if (ref.current) {
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries[0]) {
          return;
        }

        const { width, height } = entries[0].contentRect;

        // Set wrapper dimensions
        setWrapperDimensions({ width, height });

        // Set React Flow state
        useReactFlow.setState({
          width: width - overviewWidth - uiEditorWidth || 500,
          height: height || 500,
        });
      });

      resizeObserver.observe(ref.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [overviewWidth, uiEditorWidth]);

  return wrapperDimensions;
}

function findFirstVisibleSceneOnlyClickTarget(input: {
  nodesById: ReturnType<typeof useNodeInternals.getState>["x"];
  domIslandSectionIds: ReadonlySet<string>;
  transform: [number, number, number];
  wrapperDimensions: { width: number; height: number };
}): SceneOnlyClickTarget | null {
  const [translateX, translateY, zoom] = input.transform;
  if (zoom <= 0) {
    return null;
  }

  for (const node of input.nodesById.values()) {
    if (input.domIslandSectionIds.has(node.id)) {
      continue;
    }
    if (
      typeof node.width !== "number" ||
      node.width <= 0 ||
      typeof node.height !== "number" ||
      node.height <= 0
    ) {
      continue;
    }

    const flowX = node.position.x + node.width / 2;
    const flowY = node.position.y + node.height / 2;
    const topmostSectionId = findTopmostSceneOnlySectionAtFlowPosition({
      flowX,
      flowY,
      nodesById: input.nodesById,
      domIslandSectionIds: input.domIslandSectionIds,
    });
    if (topmostSectionId !== node.id) {
      continue;
    }

    const paneX = translateX + flowX * zoom;
    const paneY = translateY + flowY * zoom;
    const isInsidePane =
      paneX >= 0 &&
      paneY >= 0 &&
      paneX <= input.wrapperDimensions.width &&
      paneY <= input.wrapperDimensions.height;
    if (!isInsidePane) {
      continue;
    }

    return {
      sectionId: node.id,
      flowX,
      flowY,
      paneX,
      paneY,
    };
  }

  return null;
}

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
