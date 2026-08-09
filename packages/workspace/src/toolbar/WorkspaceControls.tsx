import { memo, useEffect, useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { TbArrowAutofitWidth, TbGridDots, TbZoomReset } from "react-icons/tb";
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../canvas/fitView";
import { toggleSnapToGrid, useWorkspaceOptions } from "../canvas/options";
import { useReactFlow } from "../canvas/store";
import { resetZoom, zoomIn, zoomOut } from "../canvas/viewportHelpers";
import { WORKSPACE_SCOPE_CLASS_NAME } from "../styles/workspaceScope";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip";

// The reference's viewport toolbar (`forks/xyflow/controls/Controls.tsx`) at the slice form the
// seam proposal fixes: the viewport group alone. The edge-toggle and plugin-placement groups left
// with their features, and the minimap group returns with the minimap batch that makes its
// toggles reachable; with one group, the reference's dividers never render.
const ACTIVE_CONTROL_CLASS_NAME = "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
const INACTIVE_CONTROL_CLASS_NAME = "text-setta-400 dark:text-setta-600";
const TOGGLE_CONTROL_CLASS_NAME =
  "cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500";

function getToggleControlClassName(active: boolean): string {
  return `${TOGGLE_CONTROL_CLASS_NAME} ${active ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`;
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
        onClick={() => zoomIn()}
        className={`react-flow__controls-zoomin ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom in"
        disabled={props.maxZoomReached}
        type="button"
        {...getWorkspaceTooltipHandlers({ content: "Zoom in" })}
      >
        <FaPlus size={15} />
      </button>
      <button
        onClick={() => zoomOut()}
        className={`react-flow__controls-zoomout ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom out"
        disabled={props.minZoomReached}
        type="button"
        {...getWorkspaceTooltipHandlers({ content: "Zoom out" })}
      >
        <FaMinus size={15} />
      </button>
      <button
        className={`react-flow__controls-fitview ${TOGGLE_CONTROL_CLASS_NAME} ${props.fitViewOnInit ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={onFitViewHandler}
        aria-label="fit view"
        type="button"
        {...getWorkspaceTooltipHandlers({ content: "Fit view" })}
      >
        <TbArrowAutofitWidth size={15} />
      </button>
      <button
        onClick={toggleSnapToGrid}
        className={getToggleControlClassName(props.snapToGrid)}
        aria-label="toggle snap to grid"
        aria-pressed={props.snapToGrid}
        type="button"
        {...getWorkspaceTooltipHandlers({
          content: props.snapToGrid ? "Disable snap to grid" : "Enable snap to grid",
        })}
      >
        <TbGridDots size={15} />
      </button>
      <button
        className={`react-flow__controls-button ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={resetZoom}
        aria-label="reset zoom"
        type="button"
        {...getWorkspaceTooltipHandlers({ content: "Reset zoom" })}
      >
        <TbZoomReset size={15} />
      </button>
    </>
  );
}

function useZoomReached() {
  const { minZoom, maxZoom } = useWorkspaceOptions(
    (x) => ({
      minZoom: x.minZoom,
      maxZoom: x.maxZoom,
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

export const WorkspaceControls = memo(function WorkspaceControls() {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const fitViewOnInit = useReactFlow((x) => x.fitViewOnInit);
  const snapToGrid = useWorkspaceOptions((x) => x.snapToGrid);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`${WORKSPACE_SCOPE_CLASS_NAME} mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800`}
      data-testid="rf__controls"
    >
      <ViewportControls
        fitViewOnInit={fitViewOnInit}
        maxZoomReached={maxZoomReached}
        minZoomReached={minZoomReached}
        snapToGrid={snapToGrid}
      />
    </div>
  );
});
