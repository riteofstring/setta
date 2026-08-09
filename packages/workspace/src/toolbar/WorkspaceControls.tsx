import { memo, useEffect, useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { IoMapOutline } from "react-icons/io5";
import {
  TbArrowAutofitWidth,
  TbGridDots,
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
  TbZoomReset,
} from "react-icons/tb";
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../canvas/fitView";
import {
  toggleMiniMap,
  toggleMiniMapSide,
  toggleSnapToGrid,
  useWorkspaceOptions,
  type MiniMapSide,
} from "../canvas/options";
import { useReactFlow } from "../canvas/store";
import { resetZoom, zoomIn, zoomOut } from "../canvas/viewportHelpers";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { getWorkspaceTooltipHandlers } from "../tooltip/WorkspaceTooltip";

// The reference's viewport toolbar (`forks/xyflow/controls/Controls.tsx`) at the slice form the
// seam proposal fixes: the viewport and minimap groups. The edge-toggle and plugin-placement
// groups left with their features, and with them every divider — the reference renders no
// divider between the viewport and minimap groups.
const ACTIVE_CONTROL_CLASS_NAME = "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
const INACTIVE_CONTROL_CLASS_NAME = "text-setta-400 dark:text-setta-600";
const TOGGLE_CONTROL_CLASS_NAME =
  "cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500";
const DECORATIVE_ICON_PROPS = { "aria-hidden": true, focusable: "false" } as const;
const COMPACT_TOUCH_TARGET_PROPS = {
  "data-setta-workspace-touch-target": "compact",
} as const;

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
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({ content: "Zoom in" })}
      >
        <FaPlus {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onClick={() => zoomOut()}
        className={`react-flow__controls-zoomout ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom out"
        disabled={props.minZoomReached}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({ content: "Zoom out" })}
      >
        <FaMinus {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        className={`react-flow__controls-fitview ${TOGGLE_CONTROL_CLASS_NAME} ${props.fitViewOnInit ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={onFitViewHandler}
        aria-label="fit view"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({ content: "Fit view" })}
      >
        <TbArrowAutofitWidth {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onClick={toggleSnapToGrid}
        className={getToggleControlClassName(props.snapToGrid)}
        aria-label="toggle snap to grid"
        aria-pressed={props.snapToGrid}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({
          content: props.snapToGrid ? "Disable snap to grid" : "Enable snap to grid",
        })}
      >
        <TbGridDots {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        className={`react-flow__controls-button ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={resetZoom}
        aria-label="reset zoom"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({ content: "Reset zoom" })}
      >
        <TbZoomReset {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
    </>
  );
}

function MiniMapControls(props: { minimapSide: MiniMapSide; showMinimap: boolean }) {
  const moveMinimapLabel =
    props.minimapSide === "left" ? "move minimap to right" : "move minimap to left";
  const moveMinimapContent =
    props.minimapSide === "left" ? "Move minimap to right" : "Move minimap to left";

  return (
    <>
      <button
        onClick={toggleMiniMap}
        className={getToggleControlClassName(props.showMinimap)}
        aria-label="toggle minimap"
        aria-pressed={props.showMinimap}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({
          content: props.showMinimap ? "Hide minimap" : "Show minimap",
        })}
      >
        <IoMapOutline {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onClick={toggleMiniMapSide}
        className={`${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label={moveMinimapLabel}
        data-testid="rf__toggle-minimap-side"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers({
          content: moveMinimapContent,
        })}
      >
        {props.minimapSide === "left" ? (
          <TbLayoutSidebarRightCollapse {...DECORATIVE_ICON_PROPS} size={15} />
        ) : (
          <TbLayoutSidebarLeftCollapse {...DECORATIVE_ICON_PROPS} size={15} />
        )}
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
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const { minZoomReached, maxZoomReached } = useZoomReached();
  const fitViewOnInit = useReactFlow((x) => x.fitViewOnInit);
  const zoom = useReactFlow((x) => x.transform[2]);
  const snapToGrid = useWorkspaceOptions((x) => x.snapToGrid);
  const showMinimap = useWorkspaceOptions((x) => x.showMinimap);
  const minimapSide = useWorkspaceOptions((x) => x.minimapSide);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`${workspaceScopeClassName} mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800`}
      data-testid="rf__controls"
      role="group"
      aria-label="Workspace view controls"
    >
      <span role="status" className="sr-only">
        Zoom {Math.round(zoom * 100)}%
      </span>
      <ViewportControls
        fitViewOnInit={fitViewOnInit}
        maxZoomReached={maxZoomReached}
        minZoomReached={minZoomReached}
        snapToGrid={snapToGrid}
      />
      <MiniMapControls minimapSide={minimapSide} showMinimap={showMinimap} />
    </div>
  );
});
