import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { WatchCodePane } from "components/Panes/Overview/WatchCode/WatchCodePane";
import "forks/xyflow/controls/style.css";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { IoMapOutline } from "react-icons/io5";
import { RiRadarLine } from "react-icons/ri";
import {
  TbArrowAutofitWidth,
  TbCircleDot,
  TbGridDots,
  TbSparkles,
  TbZoomReset,
} from "react-icons/tb";
import {
  toggleAgenticEdges,
  toggleArgEdges,
  toggleMiniMap,
  toggleSnapToGrid,
} from "state/actions/localStorage";
import { useLocalStorage, useProjectState, useSettings } from "state/definitions";
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../core/store/utils";

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

const Controls = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const fitViewOnInit = useReactFlow((x) => x.fitViewOnInit);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const showAgenticEdges = useLocalStorage((x) => x.showAgenticEdges);
  const showArgEdges = useLocalStorage((x) => x.showArgEdges);
  const showMinimap = useLocalStorage((x) => x.showMinimap);
  const watchCodeEnabled = useProjectState(
    (state) => state.projectConfig.watchCodeEnabled,
  );
  const [watchCodePortalOpen, setWatchCodePortalOpen] = useState(false);
  const watchCodeButtonRef = useRef<HTMLButtonElement | null>(null);
  const watchCodePortalRef = useRef<HTMLDivElement | null>(null);
  const styleForActive =
    "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";

  useEffect(() => {
    setIsVisible(true);
  }, []);

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

  if (!isVisible) {
    return null;
  }

  const onZoomInHandler = () => {
    zoomIn();
  };

  const onZoomOutHandler = () => {
    zoomOut();
  };

  return (
    <div
      className="mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800"
      data-testid="rf__controls"
    >
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
      <div className="my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70" />
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
      {watchCodePortalOpen
        ? createPortal(
            <aside
              ref={watchCodePortalRef}
              className="fixed bottom-16 left-[3.25rem] z-[70] w-[min(30rem,calc(100vw-4.5rem))] rounded-xl bg-setta-50/95 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.25)] backdrop-blur dark:bg-setta-950/95"
              data-testid="rf__watch-code-settings-portal"
              aria-label="Watch code settings"
            >
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
              <div className="max-h-[min(70vh,34rem)] overflow-y-auto pr-1">
                <WatchCodePane />
              </div>
            </aside>,
            document.body,
          )
        : null}
    </div>
  );
};

Controls.displayName = "Controls";

export default memo(Controls);
