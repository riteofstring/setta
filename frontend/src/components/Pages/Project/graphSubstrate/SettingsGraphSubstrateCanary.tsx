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
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { isMacOs } from "utils/utils";
import { selectSettingsGraphSubstrateCanarySections } from "./settingsGraphSubstrateCanaryModel";
import {
  createSettingsGraphSubstrateCanaryPaneInteractionController,
  type SettingsGraphSubstrateCanaryPaneInteractionController,
} from "./settingsGraphSubstrateCanaryPaneInteractionController";
import {
  createEmptySettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSection,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";
import {
  createSettingsGraphSubstrateCanarySectionDragController,
  type SettingsGraphSubstrateCanarySectionDragController,
} from "./settingsGraphSubstrateCanarySectionDragController";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryEffectivePaneWidths,
  resolveSettingsGraphSubstrateCanaryFallbackViewport,
  resolveSettingsGraphSubstrateCanarySharedViewport,
  resolveSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
  shouldPersistSettingsGraphSubstrateCanaryViewport,
  type SettingsGraphSubstrateCanaryViewportOwnership,
} from "./settingsGraphSubstrateCanaryViewport";
import {
  createSettingsGraphSubstrateCanaryViewportController,
  type SettingsGraphSubstrateCanaryViewportControllerState,
} from "./settingsGraphSubstrateCanaryViewportController";
import type { GraphViewport } from "./viewportTransform";

const ROOT_STYLE: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  position: "absolute",
  userSelect: "none",
  overflowAnchor: "none",
};

export function SettingsGraphSubstrateCanary() {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportOwnershipRef =
    useRef<SettingsGraphSubstrateCanaryViewportOwnership | null>(null);
  // Legacy toolbar zoom reads from d3's last locally-owned transform even
  // after backend-originated viewport writes update the rendered surface.
  const toolbarZoomViewportBaseRef = useRef<GraphViewport | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  const wrapperDimensions = useElementDimensions(rootRef);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef,
    behavior: "canvas",
  });
  const sections = useProjectState(
    selectSettingsGraphSubstrateCanarySections,
    _.isEqual,
  );
  const {
    draggingSectionId,
    sceneSnapshot,
    sectionById,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  } = useSettingsGraphSubstrateCanarySceneState(sections);
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
      sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
      wrapperDimensions: { width: 0, height: 0 },
    });
  const paneInteractionBehaviorRef = useRef({
    isMacOs: isMacOs(),
    maxZoom: 4,
    minZoom: 0.1,
    panOnScroll: false,
    panOnScrollMode,
    panOnScrollSpeed: 0,
    zoomActivationKeyPressed: false,
    zoomOnPinch: false,
    zoomOnScroll: false,
  });
  const paneInteractionControllerRef =
    useRef<SettingsGraphSubstrateCanaryPaneInteractionController | null>(null);
  const sectionDragControllerRef =
    useRef<SettingsGraphSubstrateCanarySectionDragController | null>(null);

  useEffect(() => {
    return () => {
      sectionDragControllerRef.current?.cleanup();
      paneInteractionControllerRef.current?.cleanup();
      useMisc.setState({ isPanScrolling: false });
      useReactFlow.setState({
        paneDragging: false,
        viewportInteractionActive: false,
        viewportPersistenceEnabled: true,
      });
    };
  }, []);

  const sectionByIdRef = useRef(sectionById);
  sectionByIdRef.current = sectionById;

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
  paneInteractionBehaviorRef.current = {
    isMacOs: isMacOs(),
    maxZoom,
    minZoom,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    zoomActivationKeyPressed,
    zoomOnPinch,
    zoomOnScroll,
  };
  const sectionDragBehaviorRef = useRef({
    nodeDragThreshold: 0,
    snapGrid,
    snapToGrid,
  });
  sectionDragBehaviorRef.current = {
    nodeDragThreshold,
    snapGrid,
    snapToGrid,
  };

  if (paneInteractionControllerRef.current === null) {
    paneInteractionControllerRef.current =
      createSettingsGraphSubstrateCanaryPaneInteractionController({
        applyControlledViewportChange,
        commitLocalViewport(nextViewport) {
          viewportOwnershipRef.current = "local";
          toolbarZoomViewportBaseRef.current = nextViewport;
          setViewport(nextViewport);
        },
        getResolvedViewport: () =>
          canaryViewportStateRef.current.resolvedViewport,
        getRootBounds: () => rootRef.current?.getBoundingClientRect() ?? null,
        getWheelBehavior: () => paneInteractionBehaviorRef.current,
        onViewportPanningChange: setIsViewportPanning,
        syncViewportInteractionState: syncCanaryViewportInteractionState,
      });
  }
  const paneInteractionController = paneInteractionControllerRef.current;

  if (sectionDragControllerRef.current === null) {
    sectionDragControllerRef.current =
      createSettingsGraphSubstrateCanarySectionDragController({
        getNodeDragThreshold: () =>
          sectionDragBehaviorRef.current.nodeDragThreshold,
        getResolvedViewport: () =>
          canaryViewportStateRef.current.resolvedViewport,
        getSectionById: (sectionId) => sectionByIdRef.current.get(sectionId),
        getSnapSettings: () => ({
          snapGrid: sectionDragBehaviorRef.current.snapGrid,
          snapToGrid: sectionDragBehaviorRef.current.snapToGrid,
        }),
        onDraggingSectionIdChange: setDraggingSectionId,
        onSectionPositionOverrideChange: setSectionPositionOverride,
      });
  }
  const sectionDragController = sectionDragControllerRef.current;

  useEffect(() => {
    if (
      (draggingSectionId && !sectionById.has(draggingSectionId)) ||
      (sectionPositionOverride &&
        !sectionById.has(sectionPositionOverride.sectionId)) ||
      sections.length === 0
    ) {
      sectionDragController.cancelSectionDrag();
    }
  }, [
    draggingSectionId,
    sectionById,
    sectionDragController,
    sectionPositionOverride,
    sections.length,
  ]);

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
    if (
      !sectionDragController.handleSectionPointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        section,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSectionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !sectionDragController.handleSectionPointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishSectionDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) {
    if (
      !sectionDragController.finishSectionDrag({
        persistLayout,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishPanePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.finishPanePan({
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePaneWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePaneWheel({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        target: event.target,
      })
    ) {
      return;
    }
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
