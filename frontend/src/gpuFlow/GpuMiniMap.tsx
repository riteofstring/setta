import cc from "classcat";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { getNodes } from "state/actions/nodeInternals";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useActiveSectionUI,
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useTemporaryMiscState,
  type ZustandNodeInternalsState,
  type ZustandProjectState,
} from "state/definitions";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import {
  areMiniMapNodesRenderableInputsEqual,
  getMiniMapMaskPath,
  getMiniMapViewBox,
  getXYWidthHeight,
  MinimapSvg,
  syncSelectedMiniMapNodes,
  type GpuMiniMapNode,
  type GpuMiniMapNodesProps,
} from "./GpuMiniMapSvg";
import {
  getBoundsOfGpuRects,
  getGpuNodesBounds,
  isMeasuredGpuNodeBoundsInput,
} from "./nodeBounds";
import { REACT_FLOW_COMPAT_CLASS_NAMES } from "./reactFlowCompatibility";
import { setCenter } from "./viewportActions";
import {
  getVisibleFlowRect,
  type GpuPoint,
  type GpuRect,
} from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 150;
const DEFAULT_OFFSET_SCALE = 5;
const DEFAULT_MASK_COLOR = "rgb(240, 240, 240, 0.6)";
const DEFAULT_MASK_STROKE_COLOR = "none";
const DEFAULT_MASK_STROKE_WIDTH = 1;
const DEFAULT_POSITION = "bottom-right";
const SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX = "section-style-preview-color-";
const DEFAULT_GPU_MINI_MAP_PROPS = {
  inversePan: false,
  maskColor: DEFAULT_MASK_COLOR,
  maskStrokeColor: DEFAULT_MASK_STROKE_COLOR,
  maskStrokeWidth: DEFAULT_MASK_STROKE_WIDTH,
  offsetScale: DEFAULT_OFFSET_SCALE,
  pannable: false,
  position: DEFAULT_POSITION,
  viewportStore: gpuFlowViewportStore,
} satisfies Required<
  Pick<
    GpuMiniMapProps,
    | "inversePan"
    | "maskColor"
    | "maskStrokeColor"
    | "maskStrokeWidth"
    | "offsetScale"
    | "pannable"
    | "position"
    | "viewportStore"
  >
>;

type GpuMiniMapPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type GpuMiniMapProps = Omit<GpuMiniMapNodesProps, "onClick"> & {
  readonly className?: string | undefined;
  readonly inversePan?: boolean | undefined;
  readonly maskColor?: string | undefined;
  readonly maskStrokeColor?: string | undefined;
  readonly maskStrokeWidth?: number | undefined;
  readonly offsetScale?: number | undefined;
  readonly onClick?:
    | ((event: ReactMouseEvent<SVGSVGElement>, position: GpuPoint) => void)
    | undefined;
  readonly onNodeClick?:
    | ((event: ReactMouseEvent, node: GpuMiniMapNode) => void)
    | undefined;
  readonly pannable?: boolean | undefined;
  readonly position?: GpuMiniMapPosition | undefined;
  readonly style?: CSSProperties | undefined;
  readonly viewportStore?: GpuFlowViewportStoreApi | undefined;
};

type ResolvedGpuMiniMapProps = GpuMiniMapProps &
  Readonly<{
    inversePan: boolean;
    maskColor: string;
    maskStrokeColor: string;
    maskStrokeWidth: number;
    offsetScale: number;
    pannable: boolean;
    position: GpuMiniMapPosition;
    viewportStore: GpuFlowViewportStoreApi;
  }>;

type GpuMiniMapSelector = {
  readonly boundingRect: GpuRect;
  readonly height: number;
  readonly maskPath: string;
  readonly offset: number;
  readonly viewBB: GpuRect;
  readonly viewBox: string;
  readonly viewScale: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type GpuMiniMapViewportState = {
  readonly height: number;
  readonly transform: ReturnType<
    GpuFlowViewportStoreApi["getState"]
  >["transform"];
  readonly width: number;
};

type GpuMiniMapViewportSyncInput = {
  readonly elementHeight: number;
  readonly elementWidth: number;
  readonly maskRef: RefObject<SVGPathElement | null>;
  readonly nodeBounds: GpuRect | null;
  readonly offsetScale: number;
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly viewportSnapshot: GpuMiniMapSelector;
  readonly viewportStore: GpuFlowViewportStoreApi;
};

type MiniMapPreviewStyleColors = Record<string, string | null>;

type MiniMapNodeVisual = {
  readonly background: string | null;
  readonly id: string;
  readonly type: string | null | undefined;
};

type GpuMiniMapInteractionOptions = {
  readonly inversePan: boolean;
  readonly onClick: GpuMiniMapProps["onClick"];
  readonly onNodeClick: GpuMiniMapProps["onNodeClick"];
  readonly pannable: boolean;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewScaleRef: RefObject<number>;
};

const selectorNodes = (state: ZustandNodeInternalsState) =>
  getNodes(state).filter(isMeasuredGpuNodeBoundsInput);

function GpuMiniMap(props: GpuMiniMapProps) {
  const {
    className,
    inversePan,
    maskColor,
    maskStrokeColor,
    maskStrokeWidth,
    nodeBorderRadius,
    nodeClassName,
    nodeColor,
    nodeComponent,
    nodeStrokeColor,
    nodeStrokeWidth,
    offsetScale,
    onClick,
    onNodeClick,
    pannable,
    position,
    shapeRendering,
    style,
    viewportStore,
  } = resolveGpuMiniMapProps(props);
  const svgRef = useRef<SVGSVGElement>(null);
  const maskRef = useRef<SVGPathElement>(null);
  const nodes = useGpuMiniMapNodes();
  const elementWidth = getMiniMapDimension(style?.width, DEFAULT_WIDTH);
  const elementHeight = getMiniMapDimension(style?.height, DEFAULT_HEIGHT);
  const nodeBounds = useMemo(
    () => (nodes.length > 0 ? getGpuNodesBounds(nodes) : null),
    [nodes],
  );
  const viewportSnapshot = getGpuMiniMapViewportSnapshot({
    elementHeight,
    elementWidth,
    nodeBounds,
    offsetScale,
    viewportState: selectGpuViewportMiniMapState(viewportStore),
  });
  const viewScaleRef = useGpuMiniMapViewportSync({
    elementHeight,
    elementWidth,
    maskRef,
    nodeBounds,
    offsetScale,
    svgRef,
    viewportSnapshot,
    viewportStore,
  });
  const interactions = useGpuMiniMapInteractions({
    inversePan,
    onClick,
    onNodeClick,
    pannable,
    viewportStore,
    viewScaleRef,
  });

  return (
    <div
      style={style}
      className={cc([
        REACT_FLOW_COMPAT_CLASS_NAMES.panel,
        REACT_FLOW_COMPAT_CLASS_NAMES.minimap,
        getMiniMapPositionClassNames(position),
        className,
      ])}
      data-testid="rf__minimap"
    >
      <MinimapSvg
        elementWidth={elementWidth}
        elementHeight={elementHeight}
        x={viewportSnapshot.x}
        y={viewportSnapshot.y}
        width={viewportSnapshot.width}
        height={viewportSnapshot.height}
        svgRef={svgRef}
        offset={viewportSnapshot.offset}
        viewBB={viewportSnapshot.viewBB}
        maskColor={maskColor}
        maskRef={maskRef}
        maskStrokeColor={maskStrokeColor}
        maskStrokeWidth={maskStrokeWidth}
        nodes={nodes}
        nodeBorderRadius={nodeBorderRadius}
        nodeClassName={nodeClassName}
        nodeColor={nodeColor}
        nodeComponent={nodeComponent}
        nodeStrokeColor={nodeStrokeColor}
        nodeStrokeWidth={nodeStrokeWidth}
        onPointerCancel={interactions.endPointerInteraction}
        onPointerDown={interactions.onPointerDown}
        onPointerMove={interactions.onPointerMove}
        onPointerUp={interactions.endPointerInteraction}
        onSvgClick={interactions.onSvgClick}
        onSvgNodeClick={interactions.onSvgNodeClick}
        shapeRendering={shapeRendering}
      />
      <GpuMiniMapSelectionSync svgRef={svgRef} />
    </div>
  );
}

GpuMiniMap.displayName = "GpuMiniMap";

export default memo(GpuMiniMap);

function resolveGpuMiniMapProps(
  props: GpuMiniMapProps,
): ResolvedGpuMiniMapProps {
  return {
    ...props,
    inversePan: props.inversePan ?? DEFAULT_GPU_MINI_MAP_PROPS.inversePan,
    maskColor: props.maskColor ?? DEFAULT_GPU_MINI_MAP_PROPS.maskColor,
    maskStrokeColor:
      props.maskStrokeColor ?? DEFAULT_GPU_MINI_MAP_PROPS.maskStrokeColor,
    maskStrokeWidth:
      props.maskStrokeWidth ?? DEFAULT_GPU_MINI_MAP_PROPS.maskStrokeWidth,
    offsetScale: props.offsetScale ?? DEFAULT_GPU_MINI_MAP_PROPS.offsetScale,
    pannable: props.pannable ?? DEFAULT_GPU_MINI_MAP_PROPS.pannable,
    position: props.position ?? DEFAULT_GPU_MINI_MAP_PROPS.position,
    viewportStore:
      props.viewportStore ?? DEFAULT_GPU_MINI_MAP_PROPS.viewportStore,
  };
}

function useGpuMiniMapInteractions({
  inversePan,
  onClick,
  onNodeClick,
  pannable,
  viewportStore,
  viewScaleRef,
}: GpuMiniMapInteractionOptions) {
  const suppressNextClickRef = useRef(false);
  const dragStateRef = useRef<{
    lastClientX: number;
    lastClientY: number;
    pointerId: number;
  } | null>(null);

  const onSvgClick = useMemo(() => {
    return (event: ReactMouseEvent<SVGSVGElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      const point = getSvgEventPoint(event, event.currentTarget);
      if (!point) {
        return;
      }
      if (onClick) {
        onClick(event, point);
        return;
      }
      setCenter(point.x, point.y, {
        store: viewportStore,
        zoom: viewportStore.getState().transform[2],
      });
    };
  }, [onClick, viewportStore]);

  const onSvgNodeClick = useMemo(() => {
    if (!onNodeClick) {
      return undefined;
    }
    return (event: ReactMouseEvent, nodeId: string) => {
      onNodeClick(event, getMiniMapNodeOrThrow(nodeId));
    };
  }, [onNodeClick]);

  const onPointerDown = useMemo(() => {
    if (!pannable) {
      return undefined;
    }
    return (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) {
        return;
      }
      dragStateRef.current = {
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        pointerId: event.pointerId,
      };
      viewportStore
        .getState()
        .setViewportInteractionFlags({ pointerPanning: true });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
  }, [pannable, viewportStore]);

  const onPointerMove = useMemo(() => {
    if (!pannable) {
      return undefined;
    }
    return (event: ReactPointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const movementX = event.clientX - dragState.lastClientX;
      const movementY = event.clientY - dragState.lastClientY;
      dragState.lastClientX = event.clientX;
      dragState.lastClientY = event.clientY;
      if (movementX === 0 && movementY === 0) {
        return;
      }
      suppressNextClickRef.current = true;
      const state = viewportStore.getState();
      const zoom = state.transform[2];
      const moveScale =
        viewScaleRef.current *
        Math.max(zoom, Math.log(zoom)) *
        (inversePan ? -1 : 1);
      state.setTransform({
        x: state.transform[0] - movementX * moveScale,
        y: state.transform[1] - movementY * moveScale,
        zoom,
      });
    };
  }, [inversePan, pannable, viewportStore, viewScaleRef]);

  const endPointerInteraction = useMemo(() => {
    if (!pannable) {
      return undefined;
    }
    return (event: ReactPointerEvent<SVGSVGElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragStateRef.current = null;
      viewportStore
        .getState()
        .setViewportInteractionFlags({ pointerPanning: false });
    };
  }, [pannable, viewportStore]);

  useEffect(() => {
    return () => {
      if (!dragStateRef.current) {
        return;
      }
      dragStateRef.current = null;
      viewportStore
        .getState()
        .setViewportInteractionFlags({ pointerPanning: false });
    };
  }, [pannable, viewportStore]);

  return {
    endPointerInteraction,
    onPointerDown,
    onPointerMove,
    onSvgClick,
    onSvgNodeClick,
  };
}

function GpuMiniMapSelectionSync({
  svgRef,
}: {
  svgRef?: RefObject<SVGSVGElement | null> | undefined;
}) {
  useEffect(() => {
    const applySelection = (activeIds: readonly string[]) => {
      syncSelectedMiniMapNodes(svgRef?.current, activeIds);
    };

    applySelection(useActiveSectionUI.getState().activeIds);

    const unsubscribe = useActiveSectionUI.subscribe(
      (state) => state.activeIds,
      (activeIds) => {
        applySelection(activeIds);
      },
      {
        equalityFn: areStringArraysEqual,
      },
    );

    let observer: MutationObserver | null = null;
    if (svgRef?.current && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        applySelection(useActiveSectionUI.getState().activeIds);
      });
      observer.observe(svgRef.current, {
        attributeFilter: ["class", "data-minimap-node-id"],
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      unsubscribe();
      observer?.disconnect();
    };
  }, [svgRef]);

  return null;
}

function useGpuMiniMapNodes(): readonly GpuMiniMapNode[] {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const nodes = useNodeInternals(
    selectorNodes,
    areMiniMapNodesRenderableInputsEqual,
  );
  const previewStyleColors = useTemporaryMiscState(
    getMiniMapPreviewStyleColors,
    areMiniMapPreviewStyleColorsEqual,
  );
  const nodeVisuals = useProjectState(
    (state) => getMiniMapNodeVisuals(state, darkMode, previewStyleColors),
    areMiniMapNodeVisualsEqual,
  );
  return useMemo(
    () => mergeMiniMapNodesWithVisuals(nodes, nodeVisuals),
    [nodeVisuals, nodes],
  );
}

function useGpuMiniMapViewportSync({
  elementHeight,
  elementWidth,
  maskRef,
  nodeBounds,
  offsetScale,
  svgRef,
  viewportSnapshot,
  viewportStore,
}: GpuMiniMapViewportSyncInput): RefObject<number> {
  const viewScaleRef = useRef(viewportSnapshot.viewScale);
  const inputRef = useRef({
    elementHeight,
    elementWidth,
    nodeBounds,
    offsetScale,
  });
  const frameRef = useRef<number | null>(null);
  viewScaleRef.current = viewportSnapshot.viewScale;
  inputRef.current = {
    elementHeight,
    elementWidth,
    nodeBounds,
    offsetScale,
  };

  useEffect(() => {
    const apply = () => {
      frameRef.current = null;
      const snapshot = getGpuMiniMapViewportSnapshot({
        ...inputRef.current,
        viewportState: selectGpuViewportMiniMapState(viewportStore),
      });
      viewScaleRef.current = snapshot.viewScale;
      applyGpuMiniMapViewportSnapshot({
        mask: maskRef.current,
        snapshot,
        svg: svgRef.current,
      });
    };
    const schedule = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestGpuAnimationFrame(apply);
    };

    apply();
    const unsubscribe = viewportStore.subscribe((state, previousState) => {
      const nextState = selectGpuViewportMiniMapStateFromStoreState(state);
      const previous =
        selectGpuViewportMiniMapStateFromStoreState(previousState);
      if (!areGpuViewportMiniMapStatesEqual(previous, nextState)) {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      if (frameRef.current !== null) {
        cancelGpuAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [maskRef, svgRef, viewportStore]);

  useEffect(() => {
    viewScaleRef.current = viewportSnapshot.viewScale;
    applyGpuMiniMapViewportSnapshot({
      mask: maskRef.current,
      snapshot: viewportSnapshot,
      svg: svgRef.current,
    });
  }, [maskRef, svgRef, viewportSnapshot]);

  return viewScaleRef;
}

function selectGpuViewportMiniMapState(
  store: GpuFlowViewportStoreApi,
): GpuMiniMapViewportState {
  return selectGpuViewportMiniMapStateFromStoreState(store.getState());
}

function selectGpuViewportMiniMapStateFromStoreState(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuMiniMapViewportState {
  return {
    height: state.height,
    transform: state.transform,
    width: state.width,
  };
}

function getGpuMiniMapViewportSnapshot({
  elementHeight,
  elementWidth,
  nodeBounds,
  offsetScale,
  viewportState,
}: {
  readonly elementHeight: number;
  readonly elementWidth: number;
  readonly nodeBounds: GpuRect | null;
  readonly offsetScale: number;
  readonly viewportState: GpuMiniMapViewportState;
}): GpuMiniMapSelector {
  const viewBB = getVisibleFlowRect({
    canvasHeight: viewportState.height,
    canvasWidth: viewportState.width,
    viewport: viewportState.transform,
  });
  const boundingRect = nodeBounds
    ? getBoundsOfGpuRects(nodeBounds, viewBB)
    : viewBB;
  const sizing = getXYWidthHeight({
    boundingRect,
    elementHeight,
    elementWidth,
    offsetScale,
  });
  return {
    ...sizing,
    boundingRect,
    maskPath: getMiniMapMaskPath({ ...sizing, viewBB }),
    viewBB,
    viewBox: getMiniMapViewBox(sizing),
  };
}

function applyGpuMiniMapViewportSnapshot({
  mask,
  snapshot,
  svg,
}: {
  readonly mask: SVGPathElement | null;
  readonly snapshot: GpuMiniMapSelector;
  readonly svg: SVGSVGElement | null;
}) {
  if (svg && svg.getAttribute("viewBox") !== snapshot.viewBox) {
    svg.setAttribute("viewBox", snapshot.viewBox);
  }
  if (mask && mask.getAttribute("d") !== snapshot.maskPath) {
    mask.setAttribute("d", snapshot.maskPath);
  }
}

function areGpuViewportMiniMapStatesEqual(
  left: GpuMiniMapViewportState,
  right: GpuMiniMapViewportState,
): boolean {
  return (
    left.height === right.height &&
    left.width === right.width &&
    left.transform[0] === right.transform[0] &&
    left.transform[1] === right.transform[1] &&
    left.transform[2] === right.transform[2]
  );
}

function getMiniMapPreviewStyleColors(
  state: Record<string, unknown>,
): MiniMapPreviewStyleColors {
  const previewColors: MiniMapPreviewStyleColors = {};
  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX)) {
      continue;
    }
    const sectionId = key.slice(SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX.length);
    previewColors[sectionId] = typeof value === "string" ? value : null;
  }
  return previewColors;
}

function areMiniMapPreviewStyleColorsEqual(
  left: MiniMapPreviewStyleColors,
  right: MiniMapPreviewStyleColors,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function getMiniMapNodeVisuals(
  state: ZustandProjectState,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): MiniMapNodeVisual[] {
  const visuals: MiniMapNodeVisual[] = [];
  for (const [sectionId, variantId] of Object.entries(
    state.projectConfig.sectionVariantMap,
  )) {
    const visual = resolveMiniMapNodeVisual(
      state,
      sectionId,
      variantId,
      darkMode,
      previewStyleColors,
    );
    if (visual) {
      visuals.push(visual);
    }
  }
  visuals.sort((left, right) => left.id.localeCompare(right.id));
  return visuals;
}

function resolveMiniMapNodeVisual(
  state: ZustandProjectState,
  sectionId: string,
  variantId: string,
  darkMode: boolean,
  previewStyleColors: MiniMapPreviewStyleColors,
): MiniMapNodeVisual | null {
  if ((state.parentSectionMap[sectionId] ?? null) !== null) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (
    !variant ||
    !state.sections[sectionId] ||
    !state.sectionImpls[variant.impl]
  ) {
    return null;
  }
  const effectiveImpl = getCurrEffectiveSectionImpl(state, sectionId);
  return {
    id: sectionId,
    type: effectiveImpl.type,
    background: resolveMiniMapNodeBackground(
      previewStyleColors[sectionId] === undefined
        ? effectiveImpl.styleColor
        : previewStyleColors[sectionId],
      darkMode,
    ),
  };
}

function resolveMiniMapNodeBackground(
  styleColor: string | null | undefined,
  darkMode: boolean,
) {
  if (styleColor === null || styleColor === undefined) {
    return null;
  }
  const normalizedStyleColor = styleColor.trim();
  if (normalizedStyleColor === "") {
    return null;
  }
  return deriveSectionStyleTheme(normalizedStyleColor, darkMode)?.bg ?? null;
}

function areMiniMapNodeVisualsEqual(
  left: readonly MiniMapNodeVisual[],
  right: readonly MiniMapNodeVisual[],
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftNode = left[index];
    const rightNode = right[index];
    if (!leftNode || !rightNode) {
      return false;
    }
    if (
      leftNode.id !== rightNode.id ||
      leftNode.type !== rightNode.type ||
      leftNode.background !== rightNode.background
    ) {
      return false;
    }
  }
  return true;
}

function mergeMiniMapNodesWithVisuals(
  nodes: readonly GpuMiniMapNode[],
  nodeVisuals: readonly MiniMapNodeVisual[],
): readonly GpuMiniMapNode[] {
  const visualsById = new Map(
    nodeVisuals.map((nodeVisual) => [nodeVisual.id, nodeVisual]),
  );
  return nodes.map((node) => {
    if (!node.id) {
      return node;
    }
    const nodeVisual = visualsById.get(node.id);
    if (!nodeVisual) {
      return node;
    }

    const nextStyle =
      nodeVisual.background !== null
        ? { ...(node.style ?? {}), background: nodeVisual.background }
        : undefined;
    if (
      node.type === nodeVisual.type &&
      areNodeStylesEqual(node.style, nextStyle)
    ) {
      return node;
    }
    return {
      ...node,
      style: nextStyle,
      type: nodeVisual.type,
    };
  });
}

function getMiniMapNodeOrThrow(nodeId: string): GpuMiniMapNode {
  const node = useNodeInternals.getState().x.get(nodeId);
  if (!node) {
    throw new Error(
      `MiniMap click target "${nodeId}" was not found in node internals.`,
    );
  }
  return node;
}

function getMiniMapDimension(
  value: number | string | undefined,
  fallback: number,
) {
  return typeof value === "number" ? value : fallback;
}

function getMiniMapPositionClassNames(position: GpuMiniMapPosition) {
  const [vertical, horizontal] = position.split("-");
  return `${vertical} ${horizontal}`;
}

function getSvgEventPoint(
  event: Pick<ReactMouseEvent<SVGSVGElement>, "clientX" | "clientY">,
  svg: SVGSVGElement,
): GpuPoint | null {
  const transform = svg.getScreenCTM();
  if (!transform) {
    return null;
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformedPoint = point.matrixTransform(transform.inverse());
  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  };
}

function areNodeStylesEqual(
  left: CSSProperties | undefined,
  right: CSSProperties | undefined,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (
      left[key as keyof CSSProperties] !== right[key as keyof CSSProperties]
    ) {
      return false;
    }
  }
  return true;
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
