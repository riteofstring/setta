import { SettaPluginCanvasControlPlacementEnum } from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import "forks/xyflow/controls/style.css";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  usePluginCanvasControls,
  usePluginRuntimeStore,
  type RegisteredPluginCanvasControl,
} from "plugins/runtime";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { IoMapOutline } from "react-icons/io5";
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
import { useLocalStorage, useSettings } from "state/definitions";
import { shallow } from "zustand/shallow";
import { onFitViewHandler } from "../core/store/utils";

const ACTIVE_CONTROL_CLASS_NAME =
  "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
const INACTIVE_CONTROL_CLASS_NAME = "text-setta-400 dark:text-setta-600";
const TOGGLE_CONTROL_CLASS_NAME =
  "cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500";
const CONTROLS_DIVIDER_CLASS_NAME =
  "my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70";

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
  const chatSharedEdgeMode = useLocalStorage((x) => x.chatSharedEdgeMode);
  const showMinimap = useLocalStorage((x) => x.showMinimap);
  const minimapSide = useLocalStorage((x) => x.minimapSide);
  const pluginCanvasControls = usePluginCanvasControls();

  useEffect(() => {
    setIsVisible(true);
  }, []);

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
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={SettaPluginCanvasControlPlacementEnum.Project}
      />
      <ViewportControls
        fitViewOnInit={fitViewOnInit}
        maxZoomReached={maxZoomReached}
        minZoomReached={minZoomReached}
        snapToGrid={snapToGrid}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={SettaPluginCanvasControlPlacementEnum.Viewport}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={SettaPluginCanvasControlPlacementEnum.Utility}
      />
      <MiniMapControls minimapSide={minimapSide} showMinimap={showMinimap} />
    </div>
  );
};

Controls.displayName = "Controls";

export default memo(Controls);
