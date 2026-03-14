import { CanvasEngineSceneAdapter } from "canvas-engine/sceneAdapter";
import Panel from "forks/xyflow/core/components/Panel";
import { useReactFlow } from "forks/xyflow/core/store";
import { getPaneRect, getNodesBounds } from "forks/xyflow/core/utils/graph";
import { getBoundsOfRects } from "forks/xyflow/core/utils";
import type { Node, Rect, ReactFlowState } from "forks/xyflow/core/types";
import {
  getXYWidthHeight,
  syncSelectedMiniMapNodes,
} from "forks/xyflow/minimap/MiniMap";
import { MiniMapNodes } from "forks/xyflow/minimap/MiniMapNodes";
import type { MiniMapNodesType } from "forks/xyflow/minimap/types";
import "forks/xyflow/minimap/style.css";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  useActiveSectionUI,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { clamp } from "utils/utils";
import { shallow } from "zustand/shallow";

const DEFAULT_MINIMAP_WIDTH = 200;
const DEFAULT_MINIMAP_HEIGHT = 150;
const DEFAULT_MINIMAP_OFFSET_SCALE = 5;

type MiniMapBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CanvasEngineMiniMapWorldPointParams = {
  clientX: number;
  clientY: number;
  bounds: MiniMapBounds;
  viewBox: Rect;
};

type CanvasEngineMiniMapViewportTransformParams = {
  worldX: number;
  worldY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  overviewWidth: number;
};

type CanvasEngineMiniMapNodeColorParams = {
  darkMode: boolean;
  style?: Node["style"];
  type?: Node["type"];
};

type MiniMapSelector = {
  transform: [number, number, number];
  width: number;
  height: number;
  viewBB: Rect;
};

const minimapSelector = (
  overviewWidth: number,
  uiEditorWidth: number,
) => {
  return (state: ReactFlowState): MiniMapSelector => ({
    transform: state.transform,
    width: state.width,
    height: state.height,
    viewBB: getPaneRect(state, overviewWidth, uiEditorWidth),
  });
};

export function getCanvasEngineMiniMapWorldPoint({
  clientX,
  clientY,
  bounds,
  viewBox,
}: CanvasEngineMiniMapWorldPointParams): { x: number; y: number } {
  const localX = clamp(clientX - bounds.left, 0, bounds.width);
  const localY = clamp(clientY - bounds.top, 0, bounds.height);
  const normalizedX = bounds.width > 0 ? localX / bounds.width : 0;
  const normalizedY = bounds.height > 0 ? localY / bounds.height : 0;
  return {
    x: viewBox.x + normalizedX * viewBox.width,
    y: viewBox.y + normalizedY * viewBox.height,
  };
}

export function getCanvasEngineMiniMapViewportTransformForCenter({
  worldX,
  worldY,
  zoom,
  viewportWidth,
  viewportHeight,
  overviewWidth,
}: CanvasEngineMiniMapViewportTransformParams): {
  x: number;
  y: number;
  zoom: number;
} {
  return {
    x: viewportWidth / 2 + overviewWidth - worldX * zoom,
    y: viewportHeight / 2 - worldY * zoom,
    zoom,
  };
}

export function CanvasEngineMiniMap() {
  const topLevelSections = useProjectState(
    (state) => state.projectConfig.topLevelSections,
  );
  const activeSectionIds = useActiveSectionUI((state) => state.activeIds);
  const overviewWidth = useLocalStorage((state) => state.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((state) => state.uiEditorTrueWidth);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const minimapSide = useLocalStorage((state) => state.minimapSide);
  const placement = getResponsiveMiniMapPlacement({
    minimapSide,
    overviewWidth,
    uiEditorWidth,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const { transform, width, height, viewBB } = useReactFlow(
    useMemo(
      () => minimapSelector(overviewWidth, uiEditorWidth),
      [overviewWidth, uiEditorWidth],
    ),
    shallow,
  );

  const nodes = useMemo(() => {
    const sceneAdapter = new CanvasEngineSceneAdapter();
    sceneAdapter.applyProjectState({
      topLevelSections,
      activeSectionIds: [],
      edges: [],
      agenticEdges: [],
      edgeHandlePositions: {},
      sectionEdgePortsBySectionId: {},
    });
    const entries = Object.keys(topLevelSections).flatMap((sectionId) => {
      const rect = sceneAdapter.getRectById(sectionId);
      if (!rect) {
        return [];
      }
      return [
        {
          id: rect.id,
          position: {
            x: rect.x,
            y: rect.y,
          },
          width: rect.width,
          height: rect.height,
          zIndex: rect.zIndex,
          tempZIndex: rect.zIndex,
          type: "default",
        } satisfies Node,
      ];
    });
    entries.sort((left, right) => {
      if (left.zIndex !== right.zIndex) {
        return left.zIndex - right.zIndex;
      }
      return left.id.localeCompare(right.id);
    });
    return entries;
  }, [topLevelSections]);

  const boundingRect = useMemo(() => {
    if (nodes.length === 0) {
      return viewBB;
    }
    return getBoundsOfRects(getNodesBounds(nodes), viewBB);
  }, [nodes, viewBB]);

  const { x, y, width: viewWidth, height: viewHeight, offset } = useMemo(
    () =>
      getXYWidthHeight({
        boundingRect,
        elementHeight: DEFAULT_MINIMAP_HEIGHT,
        elementWidth: DEFAULT_MINIMAP_WIDTH,
        offsetScale: DEFAULT_MINIMAP_OFFSET_SCALE,
      }),
    [boundingRect],
  );

  useEffect(() => {
    syncSelectedMiniMapNodes(svgRef.current, activeSectionIds);
  }, [activeSectionIds, nodes]);

  const minimapNodesProps: MiniMapNodesType = {
    nodeColor: (node) => getCanvasEngineMiniMapNodeColor({ darkMode, ...node }),
    nodeStrokeColor: (node) =>
      getCanvasEngineMiniMapNodeStrokeColor({ darkMode, ...node }),
    nodeBorderRadius: 5,
    nodeStrokeWidth: 2,
    nodeClassName: "",
    onClick: undefined,
    nodeComponent: undefined,
  };

  const updateViewportFromPointer = (clientX: number, clientY: number) => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }
    const worldPoint = getCanvasEngineMiniMapWorldPoint({
      clientX,
      clientY,
      bounds: svgElement.getBoundingClientRect(),
      viewBox: {
        x,
        y,
        width: viewWidth,
        height: viewHeight,
      },
    });
    const nextTransform = getCanvasEngineMiniMapViewportTransformForCenter({
      worldX: worldPoint.x,
      worldY: worldPoint.y,
      zoom: transform[2],
      viewportWidth: width,
      viewportHeight: height,
      overviewWidth,
    });
    useReactFlow.setState({
      transform: [nextTransform.x, nextTransform.y, nextTransform.zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
  };

  return (
    <Panel
      position={placement.position}
      style={{ transform: placement.transform }}
      className="react-flow__minimap overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm transition-transform"
      data-testid="rf__minimap"
    >
      <svg
        ref={svgRef}
        width={DEFAULT_MINIMAP_WIDTH}
        height={DEFAULT_MINIMAP_HEIGHT}
        viewBox={`${x} ${y} ${viewWidth} ${viewHeight}`}
        role="img"
        className="touch-none"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          activePointerIdRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateViewportFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          updateViewportFromPointer(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          activePointerIdRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return;
          }
          activePointerIdRef.current = null;
        }}
      >
        <MiniMapNodes nodes={nodes} {...minimapNodesProps} />
        <path
          className="react-flow__minimap-mask"
          d={`M${x - offset},${y - offset}h${viewWidth + offset * 2}v${viewHeight + offset * 2}h${-viewWidth - offset * 2}z
M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`}
          fill={
            darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"
          }
          fillRule="evenodd"
          stroke={
            darkMode ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)"
          }
          strokeWidth={2}
          pointerEvents="none"
        />
      </svg>
    </Panel>
  );
}

function getCanvasEngineMiniMapNodeColor({
  darkMode,
  style,
}: CanvasEngineMiniMapNodeColorParams): string {
  if (style?.background) {
    return String(style.background);
  }
  if (darkMode) {
    return "#2D384D";
  }
  return "#e2e8f0";
}

function getCanvasEngineMiniMapNodeStrokeColor({
  darkMode,
  style,
  type,
}: CanvasEngineMiniMapNodeColorParams): string {
  if (style?.background) {
    return String(style.background);
  }
  if (type === "input") {
    return "#0041d0";
  }
  if (type === "output") {
    return "#ff0072";
  }
  if (type === "default") {
    return darkMode ? "#cbd5e1" : "#1a192b";
  }
  return "#e2e8f0";
}

type ResponsiveMiniMapPlacement = {
  position: "bottom-left" | "bottom-right";
  transform: string;
};

function getResponsiveMiniMapPlacement({
  minimapSide,
  overviewWidth,
  uiEditorWidth,
}: {
  minimapSide: "left" | "right";
  overviewWidth: number;
  uiEditorWidth: number;
}): ResponsiveMiniMapPlacement {
  if (minimapSide === "right") {
    return {
      position: "bottom-right",
      transform: `translateX(-${Math.max(0, uiEditorWidth)}px)`,
    };
  }
  return {
    position: "bottom-left",
    transform: `translateX(${Math.max(0, overviewWidth)}px)`,
  };
}

export default memo(CanvasEngineMiniMap);
