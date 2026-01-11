import "forks/xyflow/controls/style.css";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { memo, useEffect, useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { IoMapOutline } from "react-icons/io5";
import { TbArrowAutofitWidth, TbGridDots, TbZoomReset } from "react-icons/tb";
import { toggleMiniMap, toggleSnapToGrid } from "state/actions/localStorage";
import { useLocalStorage, useSettings } from "state/definitions";
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
  const showMinimap = useLocalStorage((x) => x.showMinimap);
  const styleForActive =
    "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";

  useEffect(() => {
    setIsVisible(true);
  }, []);

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
      className="mb-11 mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800"
      data-testid="rf__controls"
    >
      <button
        onClick={onZoomInHandler}
        className="react-flow__controls-zoomin cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        title="zoom in"
        aria-label="zoom in"
        disabled={maxZoomReached}
      >
        <FaPlus size={15} />
      </button>
      <button
        onClick={onZoomOutHandler}
        className="react-flow__controls-zoomout cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        title="zoom out"
        aria-label="zoom out"
        disabled={minZoomReached}
      >
        <FaMinus size={15} />
      </button>
      <button
        className={`react-flow__controls-fitview cursor-pointer items-center justify-center overflow-clip rounded-md p-1  hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500  dark:hover:text-setta-500 ${fitViewOnInit ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
        onClick={onFitViewHandler}
        title="fit view"
        aria-label="fit view"
      >
        <TbArrowAutofitWidth size={15} />
      </button>
      <button
        onClick={toggleSnapToGrid}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md  p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500 ${snapToGrid ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
      >
        <TbGridDots size={15} />
      </button>
      <button
        className="react-flow__controls-button cursor-pointer items-center justify-center overflow-clip rounded-md p-1 text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-600 dark:hover:text-setta-500"
        onClick={resetZoom}
      >
        <TbZoomReset size={15} />
      </button>
      <button
        onClick={toggleMiniMap}
        className={`cursor-pointer items-center justify-center overflow-clip rounded-md p-1  hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500  dark:hover:text-setta-500 ${showMinimap ? styleForActive : "text-setta-400 dark:text-setta-600"}`}
      >
        <IoMapOutline size={15} />
      </button>
    </div>
  );
};

Controls.displayName = "Controls";

export default memo(Controls);
