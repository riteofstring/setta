import {
  SettaPluginCanvasControlPlacementEnum,
  type SettaPluginCanvasControlProps,
} from "@setta/app-subsystem-frontend-sdk";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  usePluginCanvasControls,
  usePluginRuntimeStore,
  type RegisteredPluginCanvasControl,
} from "plugins/runtime";
import { useEffect, useMemo, useRef } from "react";
import { IoMapOutline } from "react-icons/io5";
import { TbCircleDot, TbSparkles } from "react-icons/tb";
import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";
import {
  toggleAgenticEdges,
  toggleArgEdges,
  toggleChatSharedEdgeMode,
  toggleMiniMap,
} from "state/actions/localStorage";
import { useLocalStorage } from "state/definitions";

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
  return `${TOGGLE_CONTROL_CLASS_NAME} ${
    active ? activeClassName : INACTIVE_CONTROL_CLASS_NAME
  }`;
}

function ControlsDivider() {
  return <div className={CONTROLS_DIVIDER_CLASS_NAME} />;
}

function PluginCanvasControlRendererHost(props: {
  control: RegisteredPluginCanvasControl;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const previousControlPropsRef = useRef<SettaPluginCanvasControlProps | null>(
    null,
  );
  const serverMode = usePluginRuntimeStore(
    (state) => state.serverMode ?? "ide",
  );
  const effectiveCapabilities = usePluginRuntimeStore(
    (state) =>
      state.pluginListById[props.control.pluginId]?.effectiveCapabilities ??
      EMPTY_PLUGIN_CAPABILITIES,
  );
  const controlProps = useMemo<SettaPluginCanvasControlProps>(
    () => ({
      pluginId: props.control.pluginId,
      controlId: props.control.id,
      label: props.control.label,
      placement: props.control.placement,
      serverMode,
      effectiveCapabilities: [...effectiveCapabilities],
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
      className="flex h-6 w-6 items-center justify-center overflow-visible"
      data-setta-plugin-root={props.control.pluginId}
      data-setta-plugin-canvas-control={props.control.id}
      data-testid={`workspace-canvas-plugin-control-${props.control.pluginId}-${props.control.id}`}
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
  chatSharedEdgeMode: ChatSharedEdgeMode;
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
        data-testid="workspace-canvas-toggle-agentic-edges"
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
        data-testid="workspace-canvas-toggle-arg-edges"
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
        data-testid="workspace-canvas-toggle-chat-shared-edge-mode"
        {...getFloatingBoxHandlers({
          content: `${getWorkspaceChatSharedEdgeModeLabel(
            props.chatSharedEdgeMode,
          )} mode for shared Chat to Chat connections`,
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

function getWorkspaceChatSharedEdgeModeLabel(mode: ChatSharedEdgeMode): string {
  return mode === "workflow" ? "Workflow" : "Agentic";
}

function MinimapControls(props: { showMinimap: boolean }) {
  return (
    <button
      onClick={toggleMiniMap}
      className={getToggleControlClassName(props.showMinimap)}
      aria-label="toggle minimap"
      aria-pressed={props.showMinimap}
      data-testid="workspace-canvas-toggle-minimap"
      {...getFloatingBoxHandlers({
        content: props.showMinimap ? "Hide minimap" : "Show minimap",
      })}
    >
      <IoMapOutline size={15} />
    </button>
  );
}

export function WorkspaceCanvasControls() {
  const showAgenticEdges = useLocalStorage((state) => state.showAgenticEdges);
  const showArgEdges = useLocalStorage((state) => state.showArgEdges);
  const chatSharedEdgeMode = useLocalStorage(
    (state) => state.chatSharedEdgeMode,
  );
  const showMinimap = useLocalStorage((state) => state.showMinimap);
  const pluginCanvasControls = usePluginCanvasControls();

  return (
    <div
      className="mt-auto flex w-8 flex-col items-center gap-1 overflow-hidden rounded-md border px-0.5 pb-2 pt-1.5 dark:border-setta-800"
      data-testid="workspace-canvas-controls"
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
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={SettaPluginCanvasControlPlacementEnum.Viewport}
      />
      <PluginCanvasControls
        controls={pluginCanvasControls}
        placement={SettaPluginCanvasControlPlacementEnum.Utility}
      />
      <MinimapControls showMinimap={showMinimap} />
    </div>
  );
}
