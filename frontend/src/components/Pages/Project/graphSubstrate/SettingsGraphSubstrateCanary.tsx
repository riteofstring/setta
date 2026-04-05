import { SectionContainer } from "components/Section/Container/SectionContainer";
import Background from "forks/xyflow/background/Background";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  addNodes,
  moveNodes,
  raiseTempZIndex,
} from "state/actions/nodeInternals";
import { setZIndices } from "state/actions/sections/sectionPositions";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useObservedSectionElementSizes } from "state/hooks/observedSectionElementSizes";
import { useTabScope } from "utils/focusManager";
import type { Position } from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import {
  resolveSettingsGraphSubstrateCanarySectionDragEndPosition,
  resolveSettingsGraphSubstrateCanarySectionDragMovePosition,
  shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget,
  shouldBlockSettingsGraphSubstrateCanaryWheelTarget,
  shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget,
  shouldStartSettingsGraphSubstrateCanarySectionDrag,
} from "./settingsGraphSubstrateCanaryInteractions";
import {
  selectSettingsGraphSubstrateCanarySections,
  type GraphSubstrateCanarySection,
} from "./settingsGraphSubstrateCanaryModel";
import { syncSettingsGraphSubstrateCanaryNodes } from "./settingsGraphSubstrateCanaryNodeSync";
import {
  resolveSettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSection,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryEffectivePaneWidths,
  resolveSettingsGraphSubstrateCanaryFallbackViewport,
  resolveSettingsGraphSubstrateCanarySharedViewport,
  resolveSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
  resolveSettingsGraphSubstrateCanaryWheelOutcome,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
  shouldPersistSettingsGraphSubstrateCanaryViewport,
  type SettingsGraphSubstrateCanaryViewportOwnership,
} from "./settingsGraphSubstrateCanaryViewport";
import {
  createSettingsGraphSubstrateCanaryViewportController,
  type SettingsGraphSubstrateCanaryViewportControllerState,
} from "./settingsGraphSubstrateCanaryViewportController";
import { translateViewport, type GraphViewport } from "./viewportTransform";

const ROOT_STYLE: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  position: "absolute",
  userSelect: "none",
  overflowAnchor: "none",
};

const WHEEL_ZOOM_IDLE_TIMEOUT_MS = 180;

type ActiveSectionDrag = {
  latestWorldPosition: Position | null;
  pointerId: number;
  sectionId: string;
  started: boolean;
  originScreenPoint: Position;
  originWorldPosition: Position;
};

type ActiveViewportPan = {
  pointerId: number;
  originScreenPoint: Position;
  originViewport: GraphViewport;
};

export function SettingsGraphSubstrateCanary() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<ActiveSectionDrag | null>(null);
  const viewportPanStateRef = useRef<ActiveViewportPan | null>(null);
  const panScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const wheelZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isPanScrollingRef = useRef(false);
  const isWheelZoomingRef = useRef(false);
  const viewportOwnershipRef =
    useRef<SettingsGraphSubstrateCanaryViewportOwnership | null>(null);
  // Legacy toolbar zoom reads from d3's last locally-owned transform even
  // after backend-originated viewport writes update the rendered surface.
  const toolbarZoomViewportBaseRef = useRef<GraphViewport | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  const [sectionPositionOverride, setSectionPositionOverride] =
    useState<SettingsGraphSubstrateCanarySectionPositionOverride>(null);
  const wrapperDimensions = useElementDimensions(rootRef);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef,
    behavior: "canvas",
  });
  const nodeInternals = useNodeInternals((state) => state.x);
  const sections = useProjectState(
    (state) => selectSettingsGraphSubstrateCanarySections(state, nodeInternals),
    _.isEqual,
  );
  const canarySectionIds = useMemo(
    () => sections.map((section) => section.sectionId),
    [sections],
  );
  const observedElementSizes = useObservedSectionElementSizes(canarySectionIds);
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
  const zoomActivationKeyPressed = useReactFlow(
    (state) => state.zoomActivationKeyPressed,
  );
  const nodeDragThreshold = useReactFlow((state) => state.nodeDragThreshold);
  const {
    minZoom,
    maxZoom,
    defaultZoomLevel,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    showGridLines,
    snapGrid,
    zoomOnPinch,
    zoomOnScroll,
  } = useSettings(
    (state) => ({
      minZoom: state.gui.minZoom,
      maxZoom: state.gui.maxZoom,
      defaultZoomLevel: state.gui.defaultZoomLevel,
      panOnScroll: state.gui.panOnScroll,
      panOnScrollMode: state.gui.panOnScrollMode,
      panOnScrollSpeed: state.gui.panOnScrollSpeed,
      showGridLines: !!state.gui.showGridLines,
      snapGrid: state.gui.snapGrid,
      zoomOnPinch: state.gui.zoomOnPinch,
      zoomOnScroll: state.gui.zoomOnScroll,
    }),
    _.isEqual,
  );
  const {
    overviewVis,
    overviewTrueWidth,
    uiEditorVis,
    uiEditorTrueWidth,
    snapToGrid,
  } = useLocalStorage(
    (state) => ({
      overviewVis: state.overviewVis,
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorVis: state.uiEditorVis,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
      snapToGrid: state.snapToGrid,
    }),
    _.isEqual,
  );
  const canaryViewportStateRef =
    useRef<SettingsGraphSubstrateCanaryViewportControllerState>({
      resolvedViewport: null,
      sceneSnapshot: {
        sceneBounds: null,
        sections: [],
        sectionsById: new Map(),
      },
      wrapperDimensions: { width: 0, height: 0 },
    });

  useEffect(() => {
    return () => {
      viewportPanStateRef.current = null;
      if (panScrollTimeoutRef.current) {
        clearTimeout(panScrollTimeoutRef.current);
      }
      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
      isPanScrollingRef.current = false;
      isWheelZoomingRef.current = false;
      useMisc.setState({ isPanScrolling: false });
      useReactFlow.setState({
        paneDragging: false,
        viewportInteractionActive: false,
        viewportPersistenceEnabled: true,
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

  const sceneSnapshot = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySceneSnapshot(
      sections,
      observedElementSizes,
      sectionPositionOverride,
    );
  }, [observedElementSizes, sectionPositionOverride, sections]);
  const sceneBounds = sceneSnapshot.sceneBounds;
  const effectivePaneWidths = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
      overviewVisible: overviewVis,
      overviewTrueWidth,
      uiEditorVisible: uiEditorVis,
      uiEditorTrueWidth,
    });
  }, [overviewTrueWidth, overviewVis, uiEditorTrueWidth, uiEditorVis]);
  const visibleViewportSize = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      wrapperDimensions,
      effectivePaneWidths.overviewWidth,
      effectivePaneWidths.uiEditorWidth,
    );
  }, [effectivePaneWidths, wrapperDimensions]);
  const shouldPersistResolvedViewport =
    shouldPersistSettingsGraphSubstrateCanaryViewport(
      sharedProjectViewport,
      viewportOwnershipRef.current,
    );

  useLayoutEffect(() => {
    if (sharedProjectViewport === null) {
      if (viewportOwnershipRef.current !== "shared") {
        return;
      }
      viewportOwnershipRef.current = null;
      setViewport(null);
      return;
    }

    viewportOwnershipRef.current = "shared";
    setViewport((current) => {
      if (current === null) {
        return current;
      }
      return null;
    });
  }, [sharedProjectViewport]);

  useEffect(() => {
    if (!sharedViewport || viewportOwnershipRef.current === "local") {
      return;
    }
    if (toolbarZoomViewportBaseRef.current === null) {
      toolbarZoomViewportBaseRef.current = sharedViewport;
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
        overviewWidth: effectivePaneWidths.overviewWidth,
        uiEditorWidth: effectivePaneWidths.uiEditorWidth,
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
      toolbarZoomViewportBaseRef.current = nextViewport;
      return nextViewport;
    });
  }, [
    defaultZoomLevel,
    effectivePaneWidths,
    maxZoom,
    minZoom,
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

  useLayoutEffect(() => {
    // Keep the controller's snapshot current before paint so fast toolbar
    // actions fit against the latest visible section set.
    canaryViewportStateRef.current = {
      resolvedViewport,
      sceneSnapshot,
      wrapperDimensions,
    };
  }, [resolvedViewport, sceneSnapshot, wrapperDimensions]);

  useEffect(() => {
    const nodeInternals = useNodeInternals.getState().x;
    const nextNodeInternals = syncSettingsGraphSubstrateCanaryNodes(
      nodeInternals,
      sceneSnapshot,
    );
    if (nextNodeInternals === nodeInternals) {
      return;
    }
    useNodeInternals.setState({ x: nextNodeInternals });
  }, [sceneSnapshot]);

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
      toolbarZoomViewportBaseRef.current = nextViewport;
      return nextViewport;
    });
  }

  useEffect(() => {
    const viewportController =
      createSettingsGraphSubstrateCanaryViewportController({
        applyControlledViewportChange,
        getPaneWidths: getCurrentCanaryPaneWidths,
        getSettings: () => {
          const { defaultZoomLevel, maxZoom, minZoom } =
            useSettings.getState().gui;
          return {
            defaultZoomLevel,
            maxZoom,
            minZoom,
          };
        },
        getState: () => canaryViewportStateRef.current,
        getToolbarZoomViewportBase: () => toolbarZoomViewportBaseRef.current,
      });

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
      viewportPersistenceEnabled: shouldPersistResolvedViewport,
      width: visibleViewportSize.width,
    });
  }, [
    resolvedViewport,
    shouldPersistResolvedViewport,
    visibleViewportSize.width,
    wrapperDimensions.height,
  ]);

  function handleSectionPointerDown(
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!resolvedViewport || section.positionAndSizeLocked) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (
      shouldIgnoreSettingsGraphSubstrateCanarySectionDragTarget(event.target)
    ) {
      return;
    }

    const originWorldPosition = section.renderedPosition;
    dragStateRef.current = {
      latestWorldPosition: nodeDragThreshold === 0 ? originWorldPosition : null,
      pointerId: event.pointerId,
      sectionId: section.sectionId,
      started: nodeDragThreshold === 0,
      originScreenPoint: {
        x: event.clientX,
        y: event.clientY,
      },
      originWorldPosition,
    };
    if (nodeDragThreshold === 0) {
      beginSectionDrag(section);
    }
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

    if (!activeDrag.started) {
      const currentScreenPoint = {
        x: event.clientX,
        y: event.clientY,
      };
      if (
        !shouldStartSettingsGraphSubstrateCanarySectionDrag({
          currentScreenPoint,
          nodeDragThreshold,
          originScreenPoint: activeDrag.originScreenPoint,
        })
      ) {
        return;
      }
      const section = sectionById.get(activeDrag.sectionId);
      if (!section) {
        return;
      }
      activeDrag.started = true;
      activeDrag.originScreenPoint = currentScreenPoint;
      activeDrag.latestWorldPosition = activeDrag.originWorldPosition;
      beginSectionDrag(section);
      event.preventDefault();
      return;
    }

    const nextPosition =
      resolveSettingsGraphSubstrateCanarySectionDragMovePosition({
        currentScreenPoint: {
          x: event.clientX,
          y: event.clientY,
        },
        originScreenPoint: activeDrag.originScreenPoint,
        originWorldPosition: activeDrag.originWorldPosition,
        zoom: resolvedViewport.zoom,
      });
    activeDrag.latestWorldPosition = nextPosition;
    setSectionPositionOverride({
      sectionId: activeDrag.sectionId,
      position: nextPosition,
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
      activeDrag.started &&
      draggedSection &&
      activeDrag.latestWorldPosition
    ) {
      const persistedPosition =
        resolveSettingsGraphSubstrateCanarySectionDragEndPosition(
          activeDrag.latestWorldPosition,
          {
            snapGrid,
            snapToGrid,
          },
        );
      ensureCanaryNode({
        ...draggedSection,
        position: persistedPosition,
      });
      moveNodes([
        {
          id: activeDrag.sectionId,
          position: persistedPosition,
        },
      ]);
      setZIndices([activeDrag.sectionId], true);
    } else {
      resetCanarySectionTempZIndex(activeDrag.sectionId);
    }
    setSectionPositionOverride(null);
  }

  function beginSectionDrag(section: GraphSubstrateCanarySection) {
    ensureCanaryNode(section);
    const activeNode = useNodeInternals.getState().x.get(section.sectionId);
    if (activeNode) {
      raiseTempZIndex([activeNode]);
    }
    setDraggingSectionId(section.sectionId);
  }

  function handlePanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resolvedViewport || event.button !== 0) {
      return;
    }
    if (
      shouldBlockSettingsGraphSubstrateCanaryPanePointerTarget(event.target)
    ) {
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
      isPanScrolling: isPanScrollingRef.current,
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
    const nextViewport = translateViewport(activePan.originViewport, {
      x: event.clientX - activePan.originScreenPoint.x,
      y: event.clientY - activePan.originScreenPoint.y,
    });
    toolbarZoomViewportBaseRef.current = nextViewport;
    setViewport(nextViewport);
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
      isPanScrolling: isPanScrollingRef.current,
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

    const rootBounds = rootRef.current.getBoundingClientRect();
    const anchorScreenPoint = {
      x: event.clientX - rootBounds.left,
      y: event.clientY - rootBounds.top,
    };
    const wheelEvent = {
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
    };
    const wheelBehavior = {
      isMacOs: isMacOs(),
      isPanScrolling: isPanScrollingRef.current,
      maxZoom,
      minZoom,
      panOnScroll,
      panOnScrollMode,
      panOnScrollSpeed,
      zoomActivationKeyPressed,
      zoomOnPinch,
      zoomOnScroll,
    };
    if (
      shouldBlockSettingsGraphSubstrateCanaryWheelTarget(
        event.target,
        wheelBehavior,
      )
    ) {
      return;
    }
    const wheelOutcome = resolveSettingsGraphSubstrateCanaryWheelOutcome(
      resolvedViewport,
      anchorScreenPoint,
      wheelEvent,
      wheelBehavior,
    );
    if (!wheelOutcome) {
      return;
    }

    if (wheelOutcome.kind === "pan-scroll") {
      if (panScrollTimeoutRef.current) {
        clearTimeout(panScrollTimeoutRef.current);
      }
      isPanScrollingRef.current = true;
      syncCanaryViewportInteractionState({
        isViewportPanning: viewportPanStateRef.current !== null,
        isPanScrolling: true,
        isWheelZooming: isWheelZoomingRef.current,
      });
      panScrollTimeoutRef.current = setTimeout(() => {
        isPanScrollingRef.current = false;
        syncCanaryViewportInteractionState({
          isViewportPanning: viewportPanStateRef.current !== null,
          isPanScrolling: false,
          isWheelZooming: isWheelZoomingRef.current,
        });
      }, 150);
    } else {
      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
      isWheelZoomingRef.current = true;
      syncCanaryViewportInteractionState({
        isViewportPanning: viewportPanStateRef.current !== null,
        isPanScrolling: isPanScrollingRef.current,
        isWheelZooming: true,
      });
      wheelZoomTimeoutRef.current = setTimeout(() => {
        isWheelZoomingRef.current = false;
        syncCanaryViewportInteractionState({
          isViewportPanning: viewportPanStateRef.current !== null,
          isPanScrolling: isPanScrollingRef.current,
          isWheelZooming: false,
        });
      }, WHEEL_ZOOM_IDLE_TIMEOUT_MS);
    }

    applyControlledViewportChange((currentViewport) => {
      return (
        resolveSettingsGraphSubstrateCanaryWheelOutcome(
          currentViewport,
          anchorScreenPoint,
          wheelEvent,
          wheelBehavior,
        )?.nextViewport ?? currentViewport
      );
    });
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePaneClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!rootRef.current || event.target !== rootRef.current) {
      return;
    }
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }

    applyActiveSectionChange({ interaction: "pane-click" });
    useMisc.setState({
      lastPaneClickLocation: screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    });
    useReactFlow.setState({ nodesSelectionDims: null });
  }

  return (
    <div
      ref={rootRef}
      style={{
        ...ROOT_STYLE,
        cursor: isViewportPanning ? "grabbing" : "grab",
      }}
      className="react-flow setta-light dark:setta-dark"
      data-tab-scope="canvas"
      data-testid="graph-substrate-canary"
      onClick={handlePaneClick}
      onPointerDown={handlePanePointerDown}
      onPointerMove={handlePanePointerMove}
      onPointerUp={finishPanePan}
      onPointerCancel={finishPanePan}
      onWheel={handlePaneWheel}
    >
      {snapToGrid && showGridLines && <Background />}
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
        {sceneSnapshot.sections.length > 0 ? (
          sceneSnapshot.sections.map((section) => {
            let sectionCursor: CSSProperties["cursor"] = "grab";
            if (section.positionAndSizeLocked) {
              sectionCursor = "default";
            } else if (draggingSectionId === section.sectionId) {
              sectionCursor = "grabbing";
            }

            return (
              <div
                key={section.sectionId}
                className="react-flow__node"
                style={{
                  cursor: sectionCursor,
                  touchAction: "none",
                  position: "absolute",
                  transform: `translate(${section.renderedPosition.x}px,${section.renderedPosition.y}px)`,
                  transformOrigin: "0 0",
                  pointerEvents: "all",
                  visibility: "visible",
                  zIndex: section.tempZIndex,
                }}
                data-id={section.sectionId}
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

function getCurrentCanaryPaneWidths() {
  const localStorageState = useLocalStorage.getState();
  return resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
    overviewVisible: localStorageState.overviewVis,
    overviewTrueWidth: localStorageState.overviewTrueWidth,
    uiEditorVisible: localStorageState.uiEditorVis,
    uiEditorTrueWidth: localStorageState.uiEditorTrueWidth,
  });
}

function ensureCanaryNode(
  section:
    | GraphSubstrateCanarySection
    | SettingsGraphSubstrateCanarySceneSection,
) {
  if (useNodeInternals.getState().x.has(section.sectionId)) {
    return;
  }
  const width =
    "resolvedSize" in section ? section.resolvedSize?.width : section.width;
  const height =
    "resolvedSize" in section ? section.resolvedSize?.height : section.height;
  addNodes([
    {
      id: section.sectionId,
      position: section.position,
      width,
      height,
      zIndex: section.zIndex,
      tempZIndex: section.zIndex,
    },
  ]);
}

function resetCanarySectionTempZIndex(sectionId: string) {
  const nodeInternals = useNodeInternals.getState().x;
  const node = nodeInternals.get(sectionId);
  if (!node || node.tempZIndex === node.zIndex) {
    return;
  }
  const nextNodeInternals = new Map(nodeInternals);
  nextNodeInternals.set(sectionId, {
    ...node,
    tempZIndex: node.zIndex,
  });
  useNodeInternals.setState({ x: nextNodeInternals });
}

function syncCanaryViewportInteractionState({
  isViewportPanning,
  isPanScrolling,
  isWheelZooming,
}: {
  isViewportPanning: boolean;
  isPanScrolling: boolean;
  isWheelZooming: boolean;
}) {
  useMisc.setState({ isPanScrolling: isViewportPanning || isPanScrolling });
  useReactFlow.setState({
    paneDragging: isViewportPanning,
    viewportInteractionActive:
      isViewportPanning || isPanScrolling || isWheelZooming,
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
