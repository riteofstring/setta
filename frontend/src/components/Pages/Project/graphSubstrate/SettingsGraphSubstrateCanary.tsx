import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useReactFlow } from "forks/xyflow/core/store";
import type { CustomViewportController } from "forks/xyflow/core/types";
import { getWheelDelta } from "forks/xyflow/core/utils";
import _ from "lodash";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";
import { addNodes, moveNodes } from "state/actions/nodeInternals";
import { debounced_route_set_top_level_section_layout } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import type { Position } from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import { getSettingsGraphSubstrateCanarySceneBounds } from "./settingsGraphSubstrateCanaryBounds";
import {
  selectSettingsGraphSubstrateCanarySections,
  type GraphSubstrateCanarySection,
} from "./settingsGraphSubstrateCanaryModel";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryFallbackViewport,
  resolveSettingsGraphSubstrateCanarySharedViewport,
  resolveSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
} from "./settingsGraphSubstrateCanaryViewport";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  screenDeltaToWorldDelta,
  translateViewport,
  zoomViewportAroundScreenPoint,
  type GraphRect,
  type GraphViewport,
} from "./viewportTransform";

const ROOT_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none",
  overflowAnchor: "none",
};

const WHEEL_ZOOM_IDLE_TIMEOUT_MS = 180;
const DRAG_BLOCKING_SELECTOR =
  ".nodrag,input,textarea,select,option,a,[contenteditable='true']";
const CANARY_SECTION_SELECTOR =
  '[data-testid="graph-substrate-canary-section"]';

type ActiveSectionDrag = {
  pointerId: number;
  sectionId: string;
  originScreenPoint: Position;
  originWorldPosition: Position;
};

type ActiveViewportPan = {
  pointerId: number;
  originScreenPoint: Position;
  originViewport: GraphViewport;
};

type SectionPositionOverride = {
  sectionId: string;
  position: Position;
};

type ViewportOwnership = "auto-fit" | "local" | "shared";

type CanaryViewportState = {
  observedElementSizes: Record<string, { width: number; height: number }>;
  resolvedViewport: GraphViewport | null;
  sceneBounds: GraphRect | null;
  sectionPositionOverride: SectionPositionOverride | null;
  sections: Array<GraphSubstrateCanarySection>;
  wrapperDimensions: { width: number; height: number };
};

export function SettingsGraphSubstrateCanary() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<ActiveSectionDrag | null>(null);
  const viewportPanStateRef = useRef<ActiveViewportPan | null>(null);
  const wheelZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isWheelZoomingRef = useRef(false);
  const viewportOwnershipRef = useRef<ViewportOwnership | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  const [sectionPositionOverride, setSectionPositionOverride] =
    useState<SectionPositionOverride | null>(null);
  const wrapperDimensions = useElementDimensions(rootRef);
  const { getObservedElementRef, observedElementSizes } =
    useObservedElementSizes();
  const nodeInternals = useNodeInternals((state) => state.x);
  const sections = useProjectState(
    (state) => selectSettingsGraphSubstrateCanarySections(state, nodeInternals),
    _.isEqual,
  );
  const sharedProjectViewport = useProjectState((state) => {
    const { viewport, viewportInitialized } = state.projectConfig;
    if (!viewportInitialized || !viewport) {
      return null;
    }
    return {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    };
  }, _.isEqual);
  const sharedReactFlowViewport = useReactFlow((state) => {
    if (state.fitViewOnInit || !state.fitViewOnInitDone) {
      return null;
    }
    const [x, y, zoom] = state.transform;
    return { x, y, zoom };
  }, _.isEqual);
  const { minZoom, maxZoom, defaultZoomLevel } = useSettings(
    (state) => ({
      minZoom: state.gui.minZoom,
      maxZoom: state.gui.maxZoom,
      defaultZoomLevel: state.gui.defaultZoomLevel,
    }),
    _.isEqual,
  );
  const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage(
    (state) => ({
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
    }),
    _.isEqual,
  );
  const canaryViewportStateRef = useRef<CanaryViewportState>({
    observedElementSizes: {},
    resolvedViewport: null,
    sceneBounds: null,
    sectionPositionOverride: null,
    sections: [],
    wrapperDimensions: { width: 0, height: 0 },
  });

  useEffect(() => {
    return () => {
      viewportPanStateRef.current = null;
      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
      isWheelZoomingRef.current = false;
      useMisc.setState({ isPanScrolling: false });
      useReactFlow.setState({
        paneDragging: false,
        viewportInteractionActive: false,
      });
    };
  }, []);

  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.sectionId, section]));
  }, [sections]);

  useEffect(() => {
    if (sections.length > 0) {
      if (
        sectionPositionOverride &&
        !sectionById.has(sectionPositionOverride.sectionId)
      ) {
        setSectionPositionOverride(null);
      }
      return;
    }
    if (sectionPositionOverride !== null) {
      setSectionPositionOverride(null);
    }
    dragStateRef.current = null;
    setDraggingSectionId(null);
  }, [sectionById, sectionPositionOverride, sections.length]);

  const fallbackViewport = useMemo(() => {
    const initialSection = sections[0];
    return resolveSettingsGraphSubstrateCanaryFallbackViewport(
      defaultZoomLevel,
      initialSection
        ? {
            x: initialSection.position.x,
            y: initialSection.position.y,
          }
        : null,
    );
  }, [defaultZoomLevel, sections]);

  const sharedViewport = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySharedViewport(
      sharedProjectViewport,
      sharedReactFlowViewport,
      fallbackViewport,
    );
  }, [fallbackViewport, sharedProjectViewport, sharedReactFlowViewport]);

  const sceneBounds = useMemo(() => {
    return getSettingsGraphSubstrateCanarySceneBounds(
      sections,
      observedElementSizes,
      sectionPositionOverride,
    );
  }, [observedElementSizes, sectionPositionOverride, sections]);
  const visibleViewportSize = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      wrapperDimensions,
      overviewTrueWidth,
      uiEditorTrueWidth,
    );
  }, [overviewTrueWidth, uiEditorTrueWidth, wrapperDimensions]);

  useEffect(() => {
    if (!sharedViewport || viewportOwnershipRef.current === "local") {
      return;
    }
    viewportOwnershipRef.current = "shared";
    setViewport((current) => {
      if (
        current &&
        current.x === sharedViewport.x &&
        current.y === sharedViewport.y &&
        current.zoom === sharedViewport.zoom
      ) {
        return current;
      }
      return sharedViewport;
    });
  }, [sharedViewport]);

  useEffect(() => {
    if (
      !sceneBounds ||
      wrapperDimensions.width <= 0 ||
      wrapperDimensions.height <= 0 ||
      !shouldAutoFitSettingsGraphSubstrateCanaryViewport(
        viewport,
        sharedViewport,
      )
    ) {
      return;
    }

    const nextViewport = fitSettingsGraphSubstrateCanaryViewport(
      sceneBounds,
      wrapperDimensions,
      {
        minZoom,
        maxZoom,
        defaultZoomLevel,
        overviewWidth: overviewTrueWidth,
        uiEditorWidth: uiEditorTrueWidth,
      },
    );
    setViewport((current) => {
      if (
        current &&
        current.x === nextViewport.x &&
        current.y === nextViewport.y &&
        current.zoom === nextViewport.zoom
      ) {
        return current;
      }
      viewportOwnershipRef.current = "auto-fit";
      return nextViewport;
    });
  }, [
    defaultZoomLevel,
    maxZoom,
    minZoom,
    overviewTrueWidth,
    uiEditorTrueWidth,
    sceneBounds,
    sharedViewport,
    viewport,
    wrapperDimensions,
  ]);

  const resolvedViewport = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryViewport(
      viewport,
      sharedViewport,
      fallbackViewport,
    );
  }, [fallbackViewport, sharedViewport, viewport]);

  useEffect(() => {
    canaryViewportStateRef.current = {
      observedElementSizes,
      resolvedViewport,
      sceneBounds,
      sectionPositionOverride,
      sections,
      wrapperDimensions,
    };
  }, [
    observedElementSizes,
    resolvedViewport,
    sceneBounds,
    sectionPositionOverride,
    sections,
    wrapperDimensions,
  ]);

  function applyControlledViewportChange(
    buildNextViewport: (currentViewport: GraphViewport) => GraphViewport | null,
  ) {
    setViewport((currentViewport) => {
      const baseViewport =
        currentViewport ?? canaryViewportStateRef.current.resolvedViewport;
      if (!baseViewport) {
        return currentViewport;
      }
      const nextViewport = buildNextViewport(baseViewport);
      if (!nextViewport) {
        return currentViewport;
      }
      if (
        nextViewport.x === baseViewport.x &&
        nextViewport.y === baseViewport.y &&
        nextViewport.zoom === baseViewport.zoom
      ) {
        return baseViewport;
      }
      viewportOwnershipRef.current = "local";
      return nextViewport;
    });
  }

  useEffect(() => {
    const viewportController: CustomViewportController = {
      zoomBy: (factor: number) => {
        const { resolvedViewport, wrapperDimensions } =
          canaryViewportStateRef.current;
        const centerScreenPoint =
          getCanaryViewportCenterScreenPoint(wrapperDimensions);
        if (!resolvedViewport || !centerScreenPoint || factor === 1) {
          return;
        }
        const { minZoom, maxZoom } = useSettings.getState().gui;
        const nextZoom = Math.min(
          maxZoom,
          Math.max(minZoom, resolvedViewport.zoom * factor),
        );
        applyControlledViewportChange((currentViewport) =>
          zoomViewportAroundScreenPoint(
            currentViewport,
            centerScreenPoint,
            nextZoom,
          ),
        );
      },
      zoomTo: (zoomLevel: number) => {
        const centerScreenPoint = getCanaryViewportCenterScreenPoint(
          canaryViewportStateRef.current.wrapperDimensions,
        );
        if (!centerScreenPoint) {
          return;
        }
        const { minZoom, maxZoom } = useSettings.getState().gui;
        const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel));
        applyControlledViewportChange((currentViewport) =>
          zoomViewportAroundScreenPoint(
            currentViewport,
            centerScreenPoint,
            nextZoom,
          ),
        );
      },
      setViewport: (transform) => {
        applyControlledViewportChange((currentViewport) => ({
          x: transform.x ?? currentViewport.x,
          y: transform.y ?? currentViewport.y,
          zoom: transform.zoom ?? currentViewport.zoom,
        }));
      },
      setCenter: (x: number, y: number, options) => {
        const centerScreenPoint = getCanaryViewportCenterScreenPoint(
          canaryViewportStateRef.current.wrapperDimensions,
        );
        if (!centerScreenPoint) {
          return;
        }
        const { maxZoom } = useSettings.getState().gui;
        const nextZoom =
          typeof options?.zoom === "number" ? options.zoom : maxZoom;
        applyControlledViewportChange((currentViewport) =>
          centerViewportOnWorldPoint(currentViewport, {
            worldPoint: { x, y },
            screenPoint: centerScreenPoint,
            zoom: nextZoom,
          }),
        );
      },
      fitView: (options) => {
        const { observedElementSizes, sectionPositionOverride, sections } =
          canaryViewportStateRef.current;
        const targetSections = getCanaryFitViewSections(
          sections,
          options?.nodes,
        );
        if (targetSections.length === 0) {
          return false;
        }
        const bounds = getSettingsGraphSubstrateCanarySceneBounds(
          targetSections,
          observedElementSizes,
          sectionPositionOverride,
        );
        if (!bounds) {
          return false;
        }
        const centerScreenPoint = getCanaryViewportCenterScreenPoint(
          canaryViewportStateRef.current.wrapperDimensions,
        );
        if (!centerScreenPoint) {
          return false;
        }
        const {
          minZoom: settingsMinZoom,
          maxZoom: settingsMaxZoom,
          defaultZoomLevel: settingsDefaultZoomLevel,
        } = useSettings.getState().gui;
        const resolvedMinZoom = options?.minZoom ?? settingsMinZoom;
        let resolvedMaxZoom = options?.maxZoom ?? settingsMaxZoom;
        if (options?.initial) {
          resolvedMaxZoom = Math.min(resolvedMaxZoom, settingsDefaultZoomLevel);
        }
        if (resolvedMaxZoom < resolvedMinZoom) {
          resolvedMaxZoom = resolvedMinZoom;
        }
        applyControlledViewportChange(() =>
          fitViewportToWorldRect(
            bounds,
            resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
              canaryViewportStateRef.current.wrapperDimensions,
              useLocalStorage.getState().overviewTrueWidth,
              useLocalStorage.getState().uiEditorTrueWidth,
            ),
            {
              minZoom: resolvedMinZoom,
              maxZoom: resolvedMaxZoom,
              padding: options?.padding ?? 0.1,
              centerScreenPoint,
            },
          ),
        );
        return true;
      },
    };

    useReactFlow.setState({ viewportController });
    return () => {
      if (useReactFlow.getState().viewportController === viewportController) {
        useReactFlow.setState({ viewportController: null });
      }
    };
  }, []);

  useEffect(() => {
    if (!rootRef.current || !resolvedViewport) {
      return;
    }

    useReactFlow.setState({
      domNode: rootRef.current,
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      height: wrapperDimensions.height,
      transform: [
        resolvedViewport.x,
        resolvedViewport.y,
        resolvedViewport.zoom,
      ],
      width: visibleViewportSize.width,
    });
  }, [resolvedViewport, visibleViewportSize.width, wrapperDimensions.height]);

  function handleSectionPointerDown(
    section: GraphSubstrateCanarySection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!resolvedViewport || section.positionAndSizeLocked) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (shouldIgnoreSectionDragTarget(event.target)) {
      return;
    }

    setDraggingSectionId(section.sectionId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      sectionId: section.sectionId,
      originScreenPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      originWorldPosition: getRenderedSectionPosition(
        section,
        sectionPositionOverride,
      ),
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSectionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const activeDrag = dragStateRef.current;
    if (
      !activeDrag ||
      !resolvedViewport ||
      activeDrag.pointerId !== event.pointerId
    ) {
      return;
    }

    const worldDelta = screenDeltaToWorldDelta(
      {
        x: event.clientX - activeDrag.originScreenPoint.x,
        y: event.clientY - activeDrag.originScreenPoint.y,
      },
      resolvedViewport,
    );
    setSectionPositionOverride({
      sectionId: activeDrag.sectionId,
      position: {
        x: activeDrag.originWorldPosition.x + worldDelta.x,
        y: activeDrag.originWorldPosition.y + worldDelta.y,
      },
    });
    event.preventDefault();
  }

  function finishSectionDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) {
    const activeDrag = dragStateRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    setDraggingSectionId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const draggedSection = sectionById.get(activeDrag.sectionId);
    if (
      persistLayout &&
      draggedSection &&
      sectionPositionOverride?.sectionId === activeDrag.sectionId
    ) {
      ensureCanaryNode({
        ...draggedSection,
        position: sectionPositionOverride.position,
      });
      moveNodes([
        {
          id: sectionPositionOverride.sectionId,
          position: sectionPositionOverride.position,
        },
      ]);
      debounced_route_set_top_level_section_layout();
    }
    setSectionPositionOverride(null);
  }

  function handlePanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resolvedViewport || event.button !== 0) {
      return;
    }
    if (isBackgroundTargetBlocked(event.target)) {
      return;
    }

    viewportPanStateRef.current = {
      pointerId: event.pointerId,
      originScreenPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      originViewport: resolvedViewport,
    };
    setIsViewportPanning(true);
    syncCanaryViewportInteractionState({
      isViewportPanning: true,
      isWheelZooming: isWheelZoomingRef.current,
    });
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const activePan = viewportPanStateRef.current;
    if (!activePan || activePan.pointerId !== event.pointerId) {
      return;
    }

    viewportOwnershipRef.current = "local";
    setViewport(
      translateViewport(activePan.originViewport, {
        x: event.clientX - activePan.originScreenPoint.x,
        y: event.clientY - activePan.originScreenPoint.y,
      }),
    );
    event.preventDefault();
  }

  function finishPanePan(event: ReactPointerEvent<HTMLDivElement>) {
    const activePan = viewportPanStateRef.current;
    if (!activePan || activePan.pointerId !== event.pointerId) {
      return;
    }

    viewportPanStateRef.current = null;
    setIsViewportPanning(false);
    syncCanaryViewportInteractionState({
      isViewportPanning: false,
      isWheelZooming: isWheelZoomingRef.current,
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePaneWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!resolvedViewport || !rootRef.current) {
      return;
    }
    if (isBackgroundTargetBlocked(event.target)) {
      return;
    }

    const rootBounds = rootRef.current.getBoundingClientRect();
    const wheelFactor = event.ctrlKey && isMacOs() ? 10 : 1;
    const nextZoom =
      resolvedViewport.zoom *
      Math.pow(2, getWheelDelta(event.nativeEvent, wheelFactor));
    const clampedZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
    if (clampedZoom === resolvedViewport.zoom) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (wheelZoomTimeoutRef.current) {
      clearTimeout(wheelZoomTimeoutRef.current);
    }
    isWheelZoomingRef.current = true;
    syncCanaryViewportInteractionState({
      isViewportPanning: viewportPanStateRef.current !== null,
      isWheelZooming: true,
    });
    wheelZoomTimeoutRef.current = setTimeout(() => {
      isWheelZoomingRef.current = false;
      syncCanaryViewportInteractionState({
        isViewportPanning: viewportPanStateRef.current !== null,
        isWheelZooming: false,
      });
    }, WHEEL_ZOOM_IDLE_TIMEOUT_MS);

    setViewport((currentViewport) => {
      const baseViewport = currentViewport ?? resolvedViewport;
      viewportOwnershipRef.current = "local";
      return zoomViewportAroundScreenPoint(
        baseViewport,
        {
          x: event.clientX - rootBounds.left,
          y: event.clientY - rootBounds.top,
        },
        clampedZoom,
      );
    });
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      ref={rootRef}
      style={{
        ...ROOT_STYLE,
        cursor: isViewportPanning ? "grabbing" : "grab",
      }}
      className="react-flow setta-light dark:setta-dark"
      data-testid="graph-substrate-canary"
      onPointerDown={handlePanePointerDown}
      onPointerMove={handlePanePointerMove}
      onPointerUp={finishPanePan}
      onPointerCancel={finishPanePan}
      onWheel={handlePaneWheel}
    >
      <div
        className="react-flow__viewport"
        data-testid="graph-substrate-canary-viewport"
        style={{
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: resolvedViewport
            ? `translate(${resolvedViewport.x}px, ${resolvedViewport.y}px) scale(${resolvedViewport.zoom})`
            : undefined,
          transformOrigin: "0 0",
          zIndex: 1,
        }}
      >
        {sections.length > 0 ? (
          sections.map((section) => {
            const renderedSectionPosition = getRenderedSectionPosition(
              section,
              sectionPositionOverride,
            );
            let sectionCursor: CSSProperties["cursor"] = "grab";
            if (section.positionAndSizeLocked) {
              sectionCursor = "default";
            } else if (draggingSectionId === section.sectionId) {
              sectionCursor = "grabbing";
            }

            return (
              <div
                key={section.sectionId}
                ref={getObservedElementRef(section.sectionId)}
                className="react-flow__node"
                style={{
                  cursor: sectionCursor,
                  touchAction: "none",
                  position: "absolute",
                  transform: `translate(${renderedSectionPosition.x}px,${renderedSectionPosition.y}px)`,
                  transformOrigin: "0 0",
                  pointerEvents: "all",
                  visibility: "visible",
                  zIndex: section.zIndex,
                }}
                data-id={section.sectionId}
                data-section-id={section.sectionId}
                data-dragging={
                  draggingSectionId === section.sectionId ? "true" : "false"
                }
                data-testid="graph-substrate-canary-section"
                onPointerDownCapture={(event) =>
                  handleSectionPointerDown(section, event)
                }
                onPointerMoveCapture={handleSectionPointerMove}
                onPointerUpCapture={(event) => finishSectionDrag(event, true)}
                onPointerCancelCapture={(event) =>
                  finishSectionDrag(event, false)
                }
              >
                <SectionContainer
                  sectionId={section.sectionId}
                  isTopLevel={true}
                />
              </div>
            );
          })
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400"
            data-testid="graph-substrate-canary-empty"
          >
            No visible settings sections available for the graph substrate
            canary.
          </div>
        )}
      </div>
    </div>
  );
}

function getCanaryViewportCenterScreenPoint(wrapperDimensions: {
  width: number;
  height: number;
}) {
  const visibleViewportSize =
    resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      wrapperDimensions,
      useLocalStorage.getState().overviewTrueWidth,
      useLocalStorage.getState().uiEditorTrueWidth,
    );
  if (visibleViewportSize.width <= 0 || visibleViewportSize.height <= 0) {
    return null;
  }
  return {
    x:
      useLocalStorage.getState().overviewTrueWidth +
      visibleViewportSize.width / 2,
    y: visibleViewportSize.height / 2,
  };
}

function getCanaryFitViewSections(
  sections: Array<GraphSubstrateCanarySection>,
  nodes: Array<{ id: string }> | undefined,
) {
  if (!nodes?.length) {
    return sections;
  }
  const targetSectionIds = new Set(nodes.map((node) => node.id));
  return sections.filter((section) => targetSectionIds.has(section.sectionId));
}

function shouldIgnoreSectionDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(DRAG_BLOCKING_SELECTOR));
}

function ensureCanaryNode(section: GraphSubstrateCanarySection) {
  if (useNodeInternals.getState().x.has(section.sectionId)) {
    return;
  }
  addNodes([
    {
      id: section.sectionId,
      position: section.position,
      width: section.width,
      height: section.height,
      zIndex: section.zIndex,
      tempZIndex: section.zIndex,
    },
  ]);
}

function isBackgroundTargetBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(CANARY_SECTION_SELECTOR) !== null;
}

function getRenderedSectionPosition(
  section: GraphSubstrateCanarySection,
  sectionPositionOverride: SectionPositionOverride | null,
) {
  if (sectionPositionOverride?.sectionId === section.sectionId) {
    return sectionPositionOverride.position;
  }
  return section.position;
}

function syncCanaryViewportInteractionState({
  isViewportPanning,
  isWheelZooming,
}: {
  isViewportPanning: boolean;
  isWheelZooming: boolean;
}) {
  useMisc.setState({ isPanScrolling: isViewportPanning });
  useReactFlow.setState({
    paneDragging: isViewportPanning,
    viewportInteractionActive: isViewportPanning || isWheelZooming,
  });
}

function useElementDimensions(ref: RefObject<HTMLDivElement>) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setDimensions((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    });

    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return dimensions;
}

function useObservedElementSizes() {
  const [observedElementSizes, setObservedElementSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const refCallbacksRef = useRef(
    new Map<string, (element: HTMLDivElement | null) => void>(),
  );

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      setObservedElementSizes((current) => {
        let changed = false;
        const next = { ...current };

        for (const entry of entries) {
          const sectionId = entry.target.getAttribute("data-section-id");
          if (!sectionId) {
            continue;
          }
          if (!(entry.target instanceof HTMLElement)) {
            continue;
          }
          const width = entry.target.offsetWidth;
          const height = entry.target.offsetHeight;
          if (width <= 0 || height <= 0) {
            continue;
          }
          const previousSize = current[sectionId];
          if (previousSize?.width === width && previousSize.height === height) {
            continue;
          }
          next[sectionId] = { width, height };
          changed = true;
        }

        return changed ? next : current;
      });
    });

    observerRef.current = observer;
    for (const element of elementsRef.current.values()) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  function setObservedElement(
    sectionId: string,
    element: HTMLDivElement | null,
  ) {
    const currentElement = elementsRef.current.get(sectionId);
    if (currentElement && currentElement !== element) {
      observerRef.current?.unobserve(currentElement);
      elementsRef.current.delete(sectionId);
    }

    if (!element) {
      setObservedElementSizes((current) => {
        if (!(sectionId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[sectionId];
        return next;
      });
      return;
    }

    elementsRef.current.set(sectionId, element);
    observerRef.current?.observe(element);
  }

  function getObservedElementRef(sectionId: string) {
    const existing = refCallbacksRef.current.get(sectionId);
    if (existing) {
      return existing;
    }

    const callback = (element: HTMLDivElement | null) => {
      setObservedElement(sectionId, element);
    };
    refCallbacksRef.current.set(sectionId, callback);
    return callback;
  }

  return {
    getObservedElementRef,
    observedElementSizes,
  };
}
