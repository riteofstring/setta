import { setViewportOverride } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { debouncedDispatchViewportUpdate } from "state/actions/sectionInfos";
import { useLocalStorage, useMisc, useSettings } from "state/definitions";
import {
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "./settingsGraphSubstrateCanaryInstrumentation";
import {
  createEmptySettingsGraphSubstrateCanarySceneSnapshot,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
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
import type { GraphRect, GraphViewport } from "./viewportTransform";

type SettingsGraphSubstrateCanaryViewportRuntimeArgs = {
  defaultZoomLevel: number;
  maxZoom: number;
  minZoom: number;
  overviewTrueWidth: number;
  rootRef: RefObject<HTMLDivElement | null>;
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  sharedProjectViewport: GraphViewport | null;
  uiEditorTrueWidth: number;
};

export type SettingsGraphSubstrateCanaryViewportRuntime = {
  applyControlledViewportChange: (
    buildNextViewport: (currentViewport: GraphViewport) => GraphViewport | null,
  ) => void;
  commitLocalViewport: (nextViewport: GraphViewport) => void;
  getResolvedViewport: () => GraphViewport | null;
  getRootBounds: () => DOMRect | null;
  isViewportPanning: boolean;
  onViewportPanningChange: (nextValue: boolean) => void;
  resolvedViewport: GraphViewport | null;
  syncViewportInteractionState: (args: {
    isPanScrolling: boolean;
    isViewportPanning: boolean;
    isWheelZooming: boolean;
  }) => void;
  visibleViewportRect: GraphRect | null;
};

export function useSettingsGraphSubstrateCanaryViewportRuntime({
  defaultZoomLevel,
  maxZoom,
  minZoom,
  overviewTrueWidth,
  rootRef,
  sceneSnapshot,
  sharedProjectViewport,
  uiEditorTrueWidth,
}: SettingsGraphSubstrateCanaryViewportRuntimeArgs): SettingsGraphSubstrateCanaryViewportRuntime {
  const viewportOwnershipRef =
    useRef<SettingsGraphSubstrateCanaryViewportOwnership | null>(null);
  // Legacy toolbar zoom reads from d3's last locally-owned transform even
  // after backend-originated viewport writes update the rendered surface.
  const toolbarZoomViewportBaseRef = useRef<GraphViewport | null>(null);
  const [viewport, setViewport] = useState<GraphViewport | null>(null);
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  const wrapperDimensions = useElementDimensions(rootRef);
  const sharedReactFlowViewportRef = useRef<GraphViewport | null>(
    getCurrentSharedReactFlowViewport(),
  );
  const [sharedReactFlowViewport, setSharedReactFlowViewport] =
    useState<GraphViewport | null>(sharedReactFlowViewportRef.current);
  const canaryViewportStateRef =
    useRef<SettingsGraphSubstrateCanaryViewportControllerState>({
      resolvedViewport: null,
      sceneSnapshot: createEmptySettingsGraphSubstrateCanarySceneSnapshot(),
      wrapperDimensions: { width: 0, height: 0 },
    });
  const hasPublishedReactFlowTransformRef = useRef(false);

  const fallbackViewport = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryFallbackViewport(
      defaultZoomLevel,
      sceneSnapshot,
    );
  }, [defaultZoomLevel, sceneSnapshot]);

  const sharedViewport = useMemo(() => {
    return resolveSettingsGraphSubstrateCanarySharedViewport(
      sharedProjectViewport,
      sharedReactFlowViewport,
      fallbackViewport,
    );
  }, [fallbackViewport, sharedProjectViewport, sharedReactFlowViewport]);

  const effectivePaneWidths = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
      overviewTrueWidth,
      uiEditorTrueWidth,
    });
  }, [overviewTrueWidth, uiEditorTrueWidth]);

  const visibleViewportSize = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      wrapperDimensions,
      effectivePaneWidths.overviewWidth,
      effectivePaneWidths.uiEditorWidth,
    );
  }, [effectivePaneWidths, wrapperDimensions]);
  const visibleViewportRect = useMemo(() => {
    if (visibleViewportSize.width <= 0 || visibleViewportSize.height <= 0) {
      return null;
    }
    return {
      x: effectivePaneWidths.overviewWidth,
      y: 0,
      width: visibleViewportSize.width,
      height: visibleViewportSize.height,
    };
  }, [
    effectivePaneWidths.overviewWidth,
    visibleViewportSize.height,
    visibleViewportSize.width,
  ]);

  const shouldPersistResolvedViewport =
    shouldPersistSettingsGraphSubstrateCanaryViewport(
      sharedProjectViewport,
      viewportOwnershipRef.current,
    );

  const resolvedViewport = useMemo(() => {
    return resolveSettingsGraphSubstrateCanaryViewport(
      viewport,
      sharedViewport,
      fallbackViewport,
    );
  }, [fallbackViewport, sharedViewport, viewport]);

  useEffect(() => {
    return () => {
      useMisc.setState({ isPanScrolling: false });
      useReactFlow.setState({
        paneDragging: false,
        viewportInteractionActive: false,
        viewportPersistenceEnabled: true,
      });
    };
  }, []);

  useLayoutEffect(() => {
    if (sharedProjectViewport === null) {
      if (viewportOwnershipRef.current !== "shared") {
        return;
      }
      viewportOwnershipRef.current = null;
      setSharedReactFlowViewport((current) => {
        const nextViewport = sharedReactFlowViewportRef.current;
        if (areGraphViewportsEqual(current, nextViewport)) {
          return current;
        }
        return nextViewport;
      });
      setViewport((current) => {
        if (current === null) {
          return current;
        }
        return null;
      });
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
    return useReactFlow.subscribe(
      (state) => {
        if (state.fitViewOnInit || !state.fitViewOnInitDone) {
          return null;
        }
        const [x, y, zoom] = state.transform;
        return { x, y, zoom };
      },
      (nextViewport) => {
        measureSettingsGraphSubstrateCanaryMotionAttribution(
          "reactFlowTransformFollowerCallback",
          () => {
            sharedReactFlowViewportRef.current = nextViewport;
            if (
              sharedProjectViewport !== null ||
              viewportOwnershipRef.current === "local"
            ) {
              return;
            }
            setSharedReactFlowViewport((current) => {
              if (areGraphViewportsEqual(current, nextViewport)) {
                return current;
              }
              return nextViewport;
            });
          },
        );
      },
      {
        equalityFn: areGraphViewportsEqual,
        fireImmediately: true,
      },
    );
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
    const sceneBounds = sceneSnapshot.sceneBounds;
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
    sceneSnapshot,
    sharedViewport,
    viewport,
    wrapperDimensions,
  ]);

  useLayoutEffect(() => {
    // Keep the controller's snapshot current before paint so fast toolbar
    // actions fit against the latest visible section set.
    canaryViewportStateRef.current = {
      resolvedViewport,
      sceneSnapshot,
      wrapperDimensions,
    };
  }, [resolvedViewport, sceneSnapshot, wrapperDimensions]);

  useLayoutEffect(() => {
    if (!rootRef.current || !resolvedViewport) {
      setViewportOverride(null);
      return;
    }
    setViewportOverride({
      domNode: rootRef.current,
      viewport: resolvedViewport,
    });
    return () => {
      setViewportOverride(null);
    };
  }, [resolvedViewport, rootRef]);

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

  function commitLocalViewport(nextViewport: GraphViewport) {
    viewportOwnershipRef.current = "local";
    toolbarZoomViewportBaseRef.current = nextViewport;
    setViewport(nextViewport);
  }

  function getResolvedViewport() {
    return canaryViewportStateRef.current.resolvedViewport;
  }

  function getRootBounds() {
    return rootRef.current?.getBoundingClientRect() ?? null;
  }

  function syncViewportInteractionState({
    isViewportPanning,
    isPanScrolling,
    isWheelZooming,
  }: {
    isViewportPanning: boolean;
    isPanScrolling: boolean;
    isWheelZooming: boolean;
  }) {
    rootRef.current?.setAttribute(
      "data-viewport-interaction-active",
      isViewportPanning || isPanScrolling || isWheelZooming ? "true" : "false",
    );
    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "interactionMiscStateSync",
      () => {
        useMisc.setState({
          isPanScrolling: isViewportPanning || isPanScrolling,
        });
      },
    );
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

    const currentReactFlowState = useReactFlow.getState();
    if (
      currentReactFlowState.domNode === rootRef.current &&
      currentReactFlowState.height === wrapperDimensions.height &&
      currentReactFlowState.viewportPersistenceEnabled ===
        shouldPersistResolvedViewport &&
      currentReactFlowState.width === visibleViewportSize.width
    ) {
      return;
    }

    useReactFlow.setState({
      domNode: rootRef.current,
      height: wrapperDimensions.height,
      viewportPersistenceEnabled: shouldPersistResolvedViewport,
      width: visibleViewportSize.width,
    });
  }, [
    resolvedViewport,
    rootRef,
    shouldPersistResolvedViewport,
    visibleViewportSize.width,
    wrapperDimensions.height,
  ]);

  useEffect(() => {
    if (!resolvedViewport) {
      return;
    }
    if (wrapperDimensions.width <= 0 || wrapperDimensions.height <= 0) {
      return;
    }

    const currentReactFlowState = useReactFlow.getState();
    const shouldPublishTransform =
      !hasPublishedReactFlowTransformRef.current ||
      currentReactFlowState.transform[2] !== resolvedViewport.zoom ||
      viewportOwnershipRef.current !== "local";
    if (!shouldPublishTransform) {
      return;
    }

    measureSettingsGraphSubstrateCanaryMotionAttribution(
      "reactFlowViewportPublish",
      () => {
        useReactFlow.setState({
          fitViewOnInit: false,
          fitViewOnInitDone: true,
          transform: [
            resolvedViewport.x,
            resolvedViewport.y,
            resolvedViewport.zoom,
          ],
        });
        hasPublishedReactFlowTransformRef.current = true;
      },
    );
  }, [resolvedViewport, wrapperDimensions.height, wrapperDimensions.width]);

  useEffect(() => {
    if (!resolvedViewport || !shouldPersistResolvedViewport) {
      return;
    }
    debouncedDispatchViewportUpdate();
  }, [
    resolvedViewport?.x,
    resolvedViewport?.y,
    resolvedViewport?.zoom,
    shouldPersistResolvedViewport,
  ]);

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      viewportZoom: resolvedViewport?.zoom ?? null,
      visibleViewportSize:
        visibleViewportSize.width > 0 && visibleViewportSize.height > 0
          ? visibleViewportSize
          : null,
    });
  }, [
    resolvedViewport?.zoom,
    visibleViewportSize.height,
    visibleViewportSize.width,
  ]);

  return {
    applyControlledViewportChange,
    commitLocalViewport,
    getResolvedViewport,
    getRootBounds,
    isViewportPanning,
    onViewportPanningChange: setIsViewportPanning,
    resolvedViewport,
    syncViewportInteractionState,
    visibleViewportRect,
  };
}

function getCurrentCanaryPaneWidths() {
  const localStorageState = useLocalStorage.getState();
  return resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
    overviewTrueWidth: localStorageState.overviewTrueWidth,
    uiEditorTrueWidth: localStorageState.uiEditorTrueWidth,
  });
}

function getCurrentSharedReactFlowViewport(): GraphViewport | null {
  const reactFlowState = useReactFlow.getState();
  if (reactFlowState.fitViewOnInit || !reactFlowState.fitViewOnInitDone) {
    return null;
  }
  const [x, y, zoom] = reactFlowState.transform;
  return { x, y, zoom };
}

function areGraphViewportsEqual(
  left: GraphViewport | null,
  right: GraphViewport | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function useElementDimensions(ref: RefObject<HTMLDivElement | null>) {
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
