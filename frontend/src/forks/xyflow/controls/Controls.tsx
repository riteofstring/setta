import { WatchCodePane } from "components/Panes/Overview/WatchCode/WatchCodePane";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import "forks/xyflow/controls/style.css";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../core/store/utils";

const WATCH_CODE_PORTAL_MIN_WIDTH_PX = 280;
const WATCH_CODE_PORTAL_MAX_WIDTH_PX = 352;
const WATCH_CODE_PORTAL_MARGIN_PX = 12;
const WATCH_CODE_PORTAL_BUTTON_GAP_PX = 12;
const WATCH_CODE_PORTAL_ESTIMATED_HEIGHT_PX = 360;

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
}): boolean {
  return !args.isDeploymentMode;
}

const ControlsZoomButtons = memo(function ControlsZoomButtons() {
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const onZoomInHandler = useCallback(() => {
    zoomIn();
  }, []);
  const onZoomOutHandler = useCallback(() => {
    zoomOut();
  }, []);

  return (
    <>
      <button
        onClick={onZoomInHandler}
        className="react-flow__controls-zoomin cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        aria-label="zoom in"
        disabled={maxZoomReached}
        {...getFloatingBoxHandlers({ content: "Zoom in" })}
      >
        <FaPlus size={15} />
      </button>
      <button
        onClick={onZoomOutHandler}
        className="react-flow__controls-zoomout cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        aria-label="zoom out"
        disabled={minZoomReached}
        {...getFloatingBoxHandlers({ content: "Zoom out" })}
      >
        <FaMinus size={15} />
      </button>
    </>
  );
});

const Controls = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const fitViewOnInit = useReactFlow((x) => x.fitViewOnInit);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const chatSharedEdgeMode = useLocalStorage((x) => x.chatSharedEdgeMode);
  const showMinimap = useLocalStorage((x) => x.showMinimap);
  const minimapSide = useLocalStorage((x) => x.minimapSide);
  const watchCodeEnabled = useProjectState(
    (state) => state.projectConfig.watchCodeEnabled,
  );
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const showWatchCodePortalControl = shouldShowWatchCodePortalControl({
    isDeploymentMode,
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
  const [watchCodePortalPosition, setWatchCodePortalPosition] = useState<{
    left: number;
    top: number;
    width: number;
    caretTop: number;
  } | null>(null);
  const [watchCodePortalElement, setWatchCodePortalElement] =
    useState<HTMLDivElement | null>(null);
  const watchCodeButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchCodePortalRef = useRef<HTMLDivElement | null>(null);
  const styleForActive =
    "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
  const sharedChatModeStyle =
    chatSharedEdgeMode === "workflow"
      ? "text-amber-50 bg-amber-500 dark:bg-transparent dark:text-amber-400"
      : styleForActive;
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
      <button
        onClick={toggleAgenticEdges}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${showAgenticEdges ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        aria-label="toggle agentic edges"
        aria-pressed={showAgenticEdges}
        data-testid="rf__toggle-agentic-edges"
        {...getFloatingBoxHandlers({
          content: showAgenticEdges
            ? "Hide agentic connectors/wires"
            : "Show agentic connectors/wires",
        })}
      >
        <TbSparkles size={15} />
      </button>
      <button
        onClick={toggleArgEdges}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${showArgEdges ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        aria-label="toggle arg edges"
        aria-pressed={showArgEdges}
        data-testid="rf__toggle-arg-edges"
        {...getFloatingBoxHandlers({
          content: showArgEdges
            ? "Hide args connectors/wires"
            : "Show args connectors/wires",
        })}
      >
        <TbCircleDot size={15} />
      </button>
      <button
        onClick={toggleChatSharedEdgeMode}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md px-1 py-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${sharedChatModeStyle}`}
        aria-label="toggle shared chat edge mode"
        data-testid="rf__toggle-chat-shared-edge-mode"
        {...getFloatingBoxHandlers({
          content: `${getChatSharedEdgeModeLabel(chatSharedEdgeMode)} mode for shared Chat to Chat connections`,
        })}
      >
        <span className="font-mono text-[10px] font-semibold leading-none">
          {chatSharedEdgeMode === "workflow" ? "W" : "A"}
        </span>
      </button>
      <div className="my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70" />
      {showWatchCodePortalControl ? (
        <>
          <button
            ref={watchCodeButtonRef}
            onClick={() => setWatchCodePortalOpen((prev) => !prev)}
            className={`cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${watchCodeEnabled ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
            aria-label="watch code settings"
            aria-pressed={watchCodeEnabled}
            data-testid="rf__watch-code-settings"
            {...getFloatingBoxHandlers({
              content: "Watch Code settings",
            })}
          >
            <RiRadarLine size={15} />
          </button>
          <div className="my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70" />
        </>
      ) : null}
      <ControlsZoomButtons />
      <button
        className={`react-flow__controls-fitview cursor-pointer items-center justify-center overflow-clip rounded-md p-1  hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500  dark:hover:text-setta-500 ${fitViewOnInit ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        onClick={onFitViewHandler}
        aria-label="fit view"
        {...getFloatingBoxHandlers({ content: "Fit view" })}
      >
        <TbArrowAutofitWidth size={15} />
      </button>
      <button
        onClick={toggleSnapToGrid}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md  p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${snapToGrid ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        aria-label="toggle snap to grid"
        aria-pressed={snapToGrid}
        {...getFloatingBoxHandlers({
          content: snapToGrid ? "Disable snap to grid" : "Enable snap to grid",
        })}
      >
        <TbGridDots size={15} />
      </button>
      <button
        className="react-flow__controls-button cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        onClick={resetZoom}
        aria-label="reset zoom"
        {...getFloatingBoxHandlers({ content: "Reset zoom" })}
      >
        <TbZoomReset size={15} />
      </button>
      <button
        onClick={toggleMiniMap}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md p-1  hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500  dark:hover:text-setta-500 ${showMinimap ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        aria-label="toggle minimap"
        aria-pressed={showMinimap}
        {...getFloatingBoxHandlers({
          content: showMinimap ? "Hide minimap" : "Show minimap",
        })}
      >
        <IoMapOutline size={15} />
      </button>
      <button
        onClick={toggleMiniMapSide}
        className="cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        aria-label={
          minimapSide === "left"
            ? "move minimap to right"
            : "move minimap to left"
        }
        data-testid="rf__toggle-minimap-side"
        {...getFloatingBoxHandlers({
          content:
            minimapSide === "left"
              ? "Move minimap to right"
              : "Move minimap to left",
        })}
      >
        {minimapSide === "left" ? (
          <TbLayoutSidebarRightCollapse size={15} />
        ) : (
          <TbLayoutSidebarLeftCollapse size={15} />
        )}
      </button>
      {showWatchCodePortalControl &&
      watchCodePortalOpen &&
      watchCodePortalPosition
        ? createPortal(
            <aside
              ref={setWatchCodePortalNode}
              className="nodrag nopan nowheel fixed z-[70] flex max-h-[min(70vh,34rem)] flex-col overflow-visible rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-setta-700/70 dark:bg-setta-900/95"
              data-testid="rf__watch-code-settings-portal"
              aria-label="Watch code settings"
              style={{
                left: `${watchCodePortalPosition.left}px`,
                top: `${watchCodePortalPosition.top}px`,
                width: `${watchCodePortalPosition.width}px`,
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-5 z-10 h-[22px] w-[11px]"
                data-testid="rf__watch-code-settings-caret"
                style={{
                  top: `${watchCodePortalPosition.caretTop}px`,
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
                  onClick={() => setWatchCodePortalOpen(false)}
                >
                  <i className="gg-close" />
                </button>
              </div>
              <div className="setta-pane-scroll min-h-0 flex-1">
                <WatchCodePane inPopover />
              </div>
            </aside>,
            document.body,
          )
        : null}
    </div>
  );
};

ControlsZoomButtons.displayName = "ControlsZoomButtons";
Controls.displayName = "Controls";

export default memo(Controls);
