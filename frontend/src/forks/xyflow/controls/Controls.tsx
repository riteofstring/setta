import { WatchCodePane } from "components/Panes/Overview/WatchCode/WatchCodePane";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import "forks/xyflow/controls/style.css";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  PluginCanvasControlPlacementEnum,
  usePluginCanvasControls,
  usePluginRuntimeStore,
  type RegisteredPluginCanvasControl,
} from "plugins/runtime";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { IoMapOutline } from "react-icons/io5";
import { RiRadarLine } from "react-icons/ri";
import {
  TbArrowAutofitWidth,
  TbCircleDot,
  TbGridDots,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
  TbSparkles,
  TbZoomReset,
} from "react-icons/tb";
import { getChatSharedEdgeModeLabel } from "state/actions/chatSharedEdges";
import {
  toggleAgenticEdges,
  toggleArgEdges,
  toggleChatSharedEdgeMode,
  toggleMiniMap,
  toggleMiniMapSide,
  toggleSnapToGrid,
} from "state/actions/localStorage";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import type { PluginRuntimeResponse } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../core/store/utils";

const WATCH_CODE_PORTAL_MIN_WIDTH_PX = 280;
const WATCH_CODE_PORTAL_MAX_WIDTH_PX = 352;
const WATCH_CODE_PORTAL_MARGIN_PX = 12;
const WATCH_CODE_PORTAL_BUTTON_GAP_PX = 12;
const WATCH_CODE_PORTAL_ESTIMATED_HEIGHT_PX = 360;
const ACTIVE_CONTROL_CLASS_NAME =
  "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
const INACTIVE_CONTROL_CLASS_NAME = "text-setta-400 dark:text-setta-600";
const TOGGLE_CONTROL_CLASS_NAME =
  "cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500";
const CONTROLS_DIVIDER_CLASS_NAME =
  "my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70";

type WatchCodePortalPosition = {
  left: number;
  top: number;
  width: number;
  caretTop: number;
};

type SetWatchCodePortalOpen = (
  nextOpen: boolean | ((current: boolean) => boolean),
) => void;

const EMPTY_PLUGIN_CAPABILITIES: readonly string[] = [];

function getToggleControlClassName(
  active: boolean,
  activeClassName: string = ACTIVE_CONTROL_CLASS_NAME,
): string {
  return `${TOGGLE_CONTROL_CLASS_NAME} ${active ? activeClassName : INACTIVE_CONTROL_CLASS_NAME}`;
}

function ControlsDivider() {
  return <div className={CONTROLS_DIVIDER_CLASS_NAME} />;
}

function PluginCanvasControlRendererHost(props: {
  control: RegisteredPluginCanvasControl;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const previousControlPropsRef = useRef<object | null>(null);
  const serverMode = usePluginRuntimeStore(
    (state) => state.serverMode ?? "ide",
  );
  const effectiveCapabilities = usePluginRuntimeStore(
    (state) =>
      state.pluginListById[props.control.pluginId]?.effectiveCapabilities ??
      EMPTY_PLUGIN_CAPABILITIES,
  );
  const controlProps = useMemo(
    () => ({
      pluginId: props.control.pluginId,
      controlId: props.control.id,
      label: props.control.label,
      placement: props.control.placement,
      serverMode,
      effectiveCapabilities,
    }),
    [
      effectiveCapabilities,
      props.control.id,
      props.control.label,
      props.control.placement,
      props.control.pluginId,
      serverMode,
    ],
  );

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) {
      return;
    }
    props.control.renderer.mount(mountElement, controlProps);
    mountedRef.current = true;
    previousControlPropsRef.current = null;
    return () => {
      mountedRef.current = false;
      previousControlPropsRef.current = null;
      props.control.renderer.unmount?.(mountElement);
    };
  }, [props.control]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !mountedRef.current) {
      return;
    }
    const previousProps = previousControlPropsRef.current;
    previousControlPropsRef.current = controlProps;
    if (previousProps === null) {
      return;
    }
    if (props.control.renderer.update) {
      props.control.renderer.update(mountElement, controlProps);
      return;
    }
    props.control.renderer.unmount?.(mountElement);
    props.control.renderer.mount(mountElement, controlProps);
  }, [controlProps, props.control]);

  return (
    <div
      ref={mountRef}
      className="nodrag nopan nowheel flex h-6 w-6 items-center justify-center overflow-visible"
      data-setta-plugin-root={props.control.pluginId}
      data-setta-plugin-canvas-control={props.control.id}
      data-testid={`rf__plugin-canvas-control-${props.control.pluginId}-${props.control.id}`}
      {...getFloatingBoxHandlers({
        content: props.control.description ?? props.control.label,
      })}
    />
  );
}

function PluginCanvasControls(props: {
  controls: RegisteredPluginCanvasControl[];
  placement: RegisteredPluginCanvasControl["placement"];
}) {
  const controlsForPlacement = props.controls.filter(
    (control) => control.placement === props.placement,
  );
  if (controlsForPlacement.length === 0) {
    return null;
  }

  return (
    <>
      {controlsForPlacement.map((control) => (
        <PluginCanvasControlRendererHost
          key={`${control.pluginId}:${control.id}`}
          control={control}
        />
      ))}
      <ControlsDivider />
    </>
  );
}

function EdgeControls(props: {
  chatSharedEdgeMode: "workflow" | "all";
  showAgenticEdges: boolean;
  showArgEdges: boolean;
}) {
  const sharedChatModeStyle =
    props.chatSharedEdgeMode === "workflow"
      ? "text-amber-50 bg-amber-500 dark:bg-transparent dark:text-amber-400"
      : ACTIVE_CONTROL_CLASS_NAME;

  return (
    <>
      <button
        onClick={toggleAgenticEdges}
        className={getToggleControlClassName(props.showAgenticEdges)}
        aria-label="toggle agentic edges"
        aria-pressed={props.showAgenticEdges}
        data-testid="rf__toggle-agentic-edges"
        {...getFloatingBoxHandlers({
          content: props.showAgenticEdges
            ? "Hide agentic connectors/wires"
            : "Show agentic connectors/wires",
        })}
      >
        <TbSparkles size={15} />
      </button>
      <button
        onClick={toggleArgEdges}
        className={getToggleControlClassName(props.showArgEdges)}
        aria-label="toggle arg edges"
        aria-pressed={props.showArgEdges}
        data-testid="rf__toggle-arg-edges"
        {...getFloatingBoxHandlers({
          content: props.showArgEdges
            ? "Hide args connectors/wires"
            : "Show args connectors/wires",
        })}
      >
        <TbCircleDot size={15} />
      </button>
      <button
        onClick={toggleChatSharedEdgeMode}
        className={`${TOGGLE_CONTROL_CLASS_NAME} px-1 ${sharedChatModeStyle}`}
        aria-label="toggle shared chat edge mode"
        data-testid="rf__toggle-chat-shared-edge-mode"
        {...getFloatingBoxHandlers({
          content: `${getChatSharedEdgeModeLabel(props.chatSharedEdgeMode)} mode for shared Chat to Chat connections`,
        })}
      >
        <span className="font-mono text-[10px] font-semibold leading-none">
          {props.chatSharedEdgeMode === "workflow" ? "W" : "A"}
        </span>
      </button>
      <ControlsDivider />
    </>
  );
}

function WatchCodeControls(props: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  showWatchCodePortalControl: boolean;
  watchCodeEnabled: boolean;
  setWatchCodePortalOpen: SetWatchCodePortalOpen;
}) {
  if (!props.showWatchCodePortalControl) {
    return null;
  }

  return (
    <>
      <button
        ref={props.buttonRef}
        onClick={() => props.setWatchCodePortalOpen((prev) => !prev)}
        className={getToggleControlClassName(props.watchCodeEnabled)}
        aria-label="watch code settings"
        aria-pressed={props.watchCodeEnabled}
        data-testid="rf__watch-code-settings"
        {...getFloatingBoxHandlers({
          content: "Watch Code settings",
        })}
      >
        <RiRadarLine size={15} />
      </button>
      <ControlsDivider />
    </>
  );
}

function ViewportControls(props: {
  fitViewOnInit: boolean;
  maxZoomReached: boolean;
  minZoomReached: boolean;
  snapToGrid: boolean;
}) {
  return (
    <>
      <button
        onClick={zoomIn}
        className={`react-flow__controls-zoomin ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom in"
        disabled={props.maxZoomReached}
        {...getFloatingBoxHandlers({ content: "Zoom in" })}
      >
        <FaPlus size={15} />
      </button>
      <button
        onClick={zoomOut}
        className={`react-flow__controls-zoomout ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom out"
        disabled={props.minZoomReached}
        {...getFloatingBoxHandlers({ content: "Zoom out" })}
      >
        <FaMinus size={15} />
      </button>
      <button
        className={`react-flow__controls-fitview ${TOGGLE_CONTROL_CLASS_NAME} ${props.fitViewOnInit ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={onFitViewHandler}
        aria-label="fit view"
        {...getFloatingBoxHandlers({ content: "Fit view" })}
      >
        <TbArrowAutofitWidth size={15} />
      </button>
      <button
        onClick={toggleSnapToGrid}
        className={getToggleControlClassName(props.snapToGrid)}
        aria-label="toggle snap to grid"
        aria-pressed={props.snapToGrid}
        {...getFloatingBoxHandlers({
          content: props.snapToGrid
            ? "Disable snap to grid"
            : "Enable snap to grid",
        })}
      >
        <TbGridDots size={15} />
      </button>
      <button
        className={`react-flow__controls-button ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={resetZoom}
        aria-label="reset zoom"
        {...getFloatingBoxHandlers({ content: "Reset zoom" })}
      >
        <TbZoomReset size={15} />
      </button>
    </>
  );
}

function MiniMapControls(props: {
  minimapSide: "left" | "right";
  showMinimap: boolean;
}) {
  const moveMinimapLabel =
    props.minimapSide === "left"
      ? "move minimap to right"
      : "move minimap to left";
  const moveMinimapContent =
    props.minimapSide === "left"
      ? "Move minimap to right"
      : "Move minimap to left";

  return (
    <>
      <button
        onClick={toggleMiniMap}
        className={getToggleControlClassName(props.showMinimap)}
        aria-label="toggle minimap"
        aria-pressed={props.showMinimap}
        {...getFloatingBoxHandlers({
          content: props.showMinimap ? "Hide minimap" : "Show minimap",
        })}
      >
        <IoMapOutline size={15} />
      </button>
      <button
        onClick={toggleMiniMapSide}
        className={`${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label={moveMinimapLabel}
        data-testid="rf__toggle-minimap-side"
        {...getFloatingBoxHandlers({
          content: moveMinimapContent,
        })}
      >
        {props.minimapSide === "left" ? (
          <TbLayoutSidebarRightCollapse size={15} />
        ) : (
          <TbLayoutSidebarLeftCollapse size={15} />
        )}
      </button>
    </>
  );
}

function WatchCodePortal(props: {
  portalRef: (node: HTMLDivElement | null) => void;
  position: WatchCodePortalPosition | null;
  watchCodePortalOpen: boolean;
  setWatchCodePortalOpen: SetWatchCodePortalOpen;
}) {
  if (!props.watchCodePortalOpen || !props.position) {
    return null;
  }

  return createPortal(
    <aside
      ref={props.portalRef}
      className="nodrag nopan nowheel fixed z-[70] flex max-h-[min(70vh,34rem)] flex-col overflow-visible rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-setta-700/70 dark:bg-setta-900/95"
      data-testid="rf__watch-code-settings-portal"
      aria-label="Watch code settings"
      style={{
        left: `${props.position.left}px`,
        top: `${props.position.top}px`,
        width: `${props.position.width}px`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-5 z-10 h-[22px] w-[11px]"
        data-testid="rf__watch-code-settings-caret"
        style={{
          top: `${props.position.caretTop}px`,
          transform: "translate(-100%, -50%)",
        }}
      >
        <div className="absolute left-0 top-0 h-0 w-0 border-y-[11px] border-r-[11px] border-y-transparent border-r-setta-200/80 dark:border-r-setta-700/70" />
        <div className="absolute left-[1px] top-[1px] h-0 w-0 border-y-[10px] border-r-[10px] border-y-transparent border-r-white/95 dark:border-r-setta-900/95" />
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Watch Code
        </h2>
        <button
          type="button"
          aria-label="Close watch code settings"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 transition-colors hover:bg-setta-200/60 hover:text-setta-700 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-200"
          onClick={() => props.setWatchCodePortalOpen(false)}
        >
          <i className="gg-close" />
        </button>
      </div>
      <div className="setta-pane-scroll min-h-0 flex-1">
        <WatchCodePane inPopover />
      </div>
    </aside>,
    document.body,
  );
}

function useZoomReached() {
  const { minZoom, maxZoom } = useSettings(
    (x) => ({
      minZoom: x.gui.minZoom,
      maxZoom: x.gui.maxZoom,
    }),
    shallow,
  );
  return useReactFlow(
    (x) => ({
      minZoomReached: x.transform[2] <= minZoom,
      maxZoomReached: x.transform[2] >= maxZoom,
    }),
    shallow,
  );
}

export function shouldShowWatchCodePortalControl(args: {
  isDeploymentMode: boolean;
  watchCodeCapabilities:
    | NonNullable<PluginRuntimeResponse["featureCapabilities"]>["watchCode"]
    | null;
}): boolean {
  return (
    !args.isDeploymentMode &&
    Boolean(args.watchCodeCapabilities?.pluginEnabled) &&
    Boolean(args.watchCodeCapabilities?.python)
  );
}

const Controls = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const fitViewOnInit = useReactFlow((x) => x.fitViewOnInit);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const chatSharedEdgeMode = useLocalStorage((x) => x.chatSharedEdgeMode);
  const showMinimap = useLocalStorage((x) => x.showMinimap);
  const minimapSide = useLocalStorage((x) => x.minimapSide);
  const pluginCanvasControls = usePluginCanvasControls();
  const watchCodeEnabled = useProjectState(
    (state) => state.projectConfig.watchCodeEnabled,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const watchCodeCapabilities = usePluginRuntimeStore(
    (state) => state.watchCodeCapabilities,
  );
  const showWatchCodePortalControl = shouldShowWatchCodePortalControl({
    isDeploymentMode,
    watchCodeCapabilities,
  });
  const watchCodePortalOpen = useLocalStorage(
    (state) => state.watchCodePortalOpen,
  );
  const setWatchCodePortalOpen = useCallback(
    (nextOpen: boolean | ((current: boolean) => boolean)) => {
      useLocalStorage.setState((state) => ({
        watchCodePortalOpen:
          typeof nextOpen === "function"
            ? nextOpen(state.watchCodePortalOpen)
            : nextOpen,
      }));
    },
    [],
  );
  const [watchCodePortalPosition, setWatchCodePortalPosition] =
    useState<WatchCodePortalPosition | null>(null);
  const [watchCodePortalElement, setWatchCodePortalElement] =
    useState<HTMLDivElement | null>(null);
  const watchCodeButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchCodePortalRef = useRef<HTMLDivElement | null>(null);
  const setWatchCodePortalNode = useCallback((node: HTMLDivElement | null) => {
    watchCodePortalRef.current = node;
    setWatchCodePortalElement((current) => (current === node ? current : node));
  }, []);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (showWatchCodePortalControl) {
      return;
    }
    setWatchCodePortalOpen(false);
  }, [setWatchCodePortalOpen, showWatchCodePortalControl]);

  useEffect(() => {
    if (!watchCodePortalOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (
        watchCodeButtonRef.current?.contains(targetNode) ||
        watchCodePortalRef.current?.contains(targetNode)
      ) {
        return;
      }
      setWatchCodePortalOpen(false);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setWatchCodePortalOpen(false);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [watchCodePortalOpen]);

  useEffect(() => {
    if (!watchCodePortalOpen) {
      setWatchCodePortalPosition(null);
      return;
    }

    let animationFrameId: number | null = null;
    let settlePassesRemaining = 0;

    const updatePosition = () => {
      const button = watchCodeButtonRef.current;
      if (!button) {
        return;
      }
      const buttonRect = button.getBoundingClientRect();
      const portalHeight =
        watchCodePortalRef.current?.getBoundingClientRect().height ??
        WATCH_CODE_PORTAL_ESTIMATED_HEIGHT_PX;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const maxAllowedWidth = Math.max(
        WATCH_CODE_PORTAL_MIN_WIDTH_PX,
        viewportWidth - WATCH_CODE_PORTAL_MARGIN_PX * 2,
      );
      const width = Math.min(WATCH_CODE_PORTAL_MAX_WIDTH_PX, maxAllowedWidth);
      const preferredLeft = buttonRect.right + WATCH_CODE_PORTAL_BUTTON_GAP_PX;
      const maxLeft = viewportWidth - WATCH_CODE_PORTAL_MARGIN_PX - width;
      const left = Math.max(
        WATCH_CODE_PORTAL_MARGIN_PX,
        Math.min(preferredLeft, maxLeft),
      );

      const minTop = WATCH_CODE_PORTAL_MARGIN_PX;
      const maxTop = Math.max(
        minTop,
        viewportHeight - WATCH_CODE_PORTAL_MARGIN_PX - portalHeight,
      );
      const top = Math.max(minTop, Math.min(buttonRect.top - 24, maxTop));

      const buttonCenterY = buttonRect.top + buttonRect.height / 2;
      const maxCaretTop = Math.max(12, portalHeight - 12);
      const caretTop = Math.max(12, Math.min(buttonCenterY - top, maxCaretTop));
      const roundedCaretTop = Math.round(caretTop * 10) / 10;

      setWatchCodePortalPosition((previousPosition) => {
        if (
          previousPosition &&
          previousPosition.left === left &&
          previousPosition.top === top &&
          previousPosition.width === width &&
          previousPosition.caretTop === roundedCaretTop
        ) {
          return previousPosition;
        }
        return {
          left,
          top,
          width,
          caretTop: roundedCaretTop,
        };
      });
    };

    const runSettlingPasses = (passCount: number) => {
      settlePassesRemaining = Math.max(settlePassesRemaining, passCount);
      if (animationFrameId !== null) {
        return;
      }
      const runNextPass = () => {
        animationFrameId = null;
        updatePosition();
        settlePassesRemaining -= 1;
        if (settlePassesRemaining > 0) {
          animationFrameId = window.requestAnimationFrame(runNextPass);
        }
      };
      animationFrameId = window.requestAnimationFrame(runNextPass);
    };

    updatePosition();
    runSettlingPasses(8);

    const handleViewportChange = () => {
      runSettlingPasses(3);
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        runSettlingPasses(3);
      });
      if (watchCodePortalElement) {
        resizeObserver.observe(watchCodePortalElement);
      }
      if (watchCodeButtonRef.current) {
        resizeObserver.observe(watchCodeButtonRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
    };
  }, [watchCodePortalElement, watchCodePortalOpen]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800"
      data-testid="rf__controls"
    >
      <EdgeControls
        chatSharedEdgeMode={chatSharedEdgeMode}
        showAgenticEdges={showAgenticEdges}
        showArgEdges={showArgEdges}
      />
      <WatchCodeControls
        buttonRef={watchCodeButtonRef}
        showWatchCodePortalControl={showWatchCodePortalControl}
        watchCodeEnabled={watchCodeEnabled}
        setWatchCodePortalOpen={setWatchCodePortalOpen}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={PluginCanvasControlPlacementEnum.Project}
      />
      <ViewportControls
        fitViewOnInit={fitViewOnInit}
        maxZoomReached={maxZoomReached}
        minZoomReached={minZoomReached}
        snapToGrid={snapToGrid}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={PluginCanvasControlPlacementEnum.Viewport}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={PluginCanvasControlPlacementEnum.Utility}
      />
      <MiniMapControls minimapSide={minimapSide} showMinimap={showMinimap} />
      <WatchCodePortal
        portalRef={setWatchCodePortalNode}
        position={showWatchCodePortalControl ? watchCodePortalPosition : null}
        watchCodePortalOpen={watchCodePortalOpen}
        setWatchCodePortalOpen={setWatchCodePortalOpen}
      />
    </div>
  );
};

Controls.displayName = "Controls";

export default memo(Controls);
