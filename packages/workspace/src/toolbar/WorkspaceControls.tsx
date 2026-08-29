import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import {
  ACTIVE_CONTROL_CLASS_NAME,
  COMPACT_TOUCH_TARGET_PROPS,
  DECORATIVE_ICON_PROPS,
  getToggleControlClassName,
  INACTIVE_CONTROL_CLASS_NAME,
  TOGGLE_CONTROL_CLASS_NAME,
} from "./workspaceControlStyles";
import { WorkspaceToolbarGroup } from "./WorkspaceToolbarGroup";
import { useWorkspaceHost } from "../workspaceHostContext";

function runZoomOnPointerDown(
  event: ReactPointerEvent<HTMLButtonElement>,
  zoom: () => void,
): void {
  if (event.button !== 0 || event.isPrimary === false) {
    return;
  }
  zoom();
}

function runZoomOnNonPointerClick(
  event: ReactMouseEvent<HTMLButtonElement>,
  zoom: () => void,
): void {
  if (event.detail === 0) {
    zoom();
  }
}

function ViewportControls(props: {
  fitViewOnInit: boolean;
  maxZoomReached: boolean;
  minZoomReached: boolean;
  snapToGrid: boolean;
}) {
  const host = useWorkspaceHost();
  return (
    <>
      <button
        onPointerDown={(event) =>
          runZoomOnPointerDown(event, () => zoomIn(host))
        }
        onClick={(event) => runZoomOnNonPointerClick(event, () => zoomIn(host))}
        className={`react-flow__controls-zoomin ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom in"
        disabled={props.maxZoomReached}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, { content: "Zoom in" })}
      >
        <FaPlus {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onPointerDown={(event) =>
          runZoomOnPointerDown(event, () => zoomOut(host))
        }
        onClick={(event) =>
          runZoomOnNonPointerClick(event, () => zoomOut(host))
        }
        className={`react-flow__controls-zoomout ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label="zoom out"
        disabled={props.minZoomReached}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, { content: "Zoom out" })}
      >
        <FaMinus {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        className={`react-flow__controls-fitview ${TOGGLE_CONTROL_CLASS_NAME} ${props.fitViewOnInit ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={() => onFitViewHandler(host)}
        aria-label="fit view"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, { content: "Fit view" })}
      >
        <TbArrowAutofitWidth {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onClick={() => toggleSnapToGrid(host)}
        className={getToggleControlClassName(props.snapToGrid)}
        aria-label="toggle snap to grid"
        aria-pressed={props.snapToGrid}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, {
          content: props.snapToGrid
            ? "Disable snap to grid"
            : "Enable snap to grid",
        })}
      >
        <TbGridDots {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        className={`react-flow__controls-button ${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        onClick={() => resetZoom(host)}
        aria-label="reset zoom"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, { content: "Reset zoom" })}
      >
        <TbZoomReset {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
    </>
  );
}

function MiniMapControls(props: {
  minimapSide: MiniMapSide;
  showMinimap: boolean;
}) {
  const host = useWorkspaceHost();
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
        onClick={() => toggleMiniMap(host)}
        className={getToggleControlClassName(props.showMinimap)}
        aria-label="toggle minimap"
        aria-pressed={props.showMinimap}
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, {
          content: props.showMinimap ? "Hide minimap" : "Show minimap",
        })}
      >
        <IoMapOutline {...DECORATIVE_ICON_PROPS} size={15} />
      </button>
      <button
        onClick={() => toggleMiniMapSide(host)}
        className={`${TOGGLE_CONTROL_CLASS_NAME} ${INACTIVE_CONTROL_CLASS_NAME}`}
        aria-label={moveMinimapLabel}
        data-testid="rf__toggle-minimap-side"
        type="button"
        {...COMPACT_TOUCH_TARGET_PROPS}
        {...getWorkspaceTooltipHandlers(host, {
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

export function WorkspaceControls() {
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
      <WorkspaceToolbarGroup placement="before-viewport" />
      <ViewportControls
        fitViewOnInit={fitViewOnInit}
        maxZoomReached={maxZoomReached}
        minZoomReached={minZoomReached}
        snapToGrid={snapToGrid}
      />
      <WorkspaceToolbarGroup placement="before-minimap" />
      <MiniMapControls minimapSide={minimapSide} showMinimap={showMinimap} />
    </div>
  );
}
