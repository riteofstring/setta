import { useCallback, useEffect, useState } from "react";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import type { Viewport } from "../document/types.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { getWorkspaceOptionsStore } from "./options.js";
import { getReactFlowStore } from "./store.js";
import { clamp } from "./utils.js";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime.js";
import { deepEqual } from "../state/deepEqual.js";

export function getInitialCanvasViewport(host: WorkspaceHost): Viewport {
  const viewport = getWorkspaceDocumentStore(host).getState().viewport;
  if (viewport === null) {
    getReactFlowStore(host).setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
    return { x: 0, y: 0, zoom: 1 };
  }

  getReactFlowStore(host).setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });
  return viewport;
}

export function startCanvasViewportDocumentSync(host: WorkspaceHost) {
  const reactFlowStore = getReactFlowStore(host);
  return reactFlowStore.subscribe(
    (state) => ({
      transform: state.transform,
      fitViewOnInit: state.fitViewOnInit,
      fitViewOnInitDone: state.fitViewOnInitDone,
    }),
    (newState, prevState) => {
      const autoFitTransition =
        newState.fitViewOnInitDone &&
        (newState.fitViewOnInit || prevState.fitViewOnInit);
      if (autoFitTransition && newState.fitViewOnInit) {
        reactFlowStore.setState({ fitViewOnInit: false });
        return;
      }
      const [x, y, zoom] = newState.transform;
      getWorkspaceDocumentStore(host).setState({ viewport: { x, y, zoom } });
      notifyWorkspaceDocumentChange(host, null);
    },
    { equalityFn: deepEqual },
  );
}

function syncCanvasViewportTransform(
  host: WorkspaceHost,
  viewport: Viewport,
): void {
  const reactFlowStore = getReactFlowStore(host);
  const transform: [number, number, number] = [
    viewport.x,
    viewport.y,
    viewport.zoom,
  ];
  if (deepEqual(reactFlowStore.getState().transform, transform)) {
    return;
  }
  reactFlowStore.setState({ transform });
}

export function useCanvasViewportDocumentSync() {
  const host = useWorkspaceHost();
  const [defaultViewport] = useState(() => getInitialCanvasViewport(host));

  const onViewportChange = useCallback(
    (nextViewport: Viewport) => {
      syncCanvasViewportTransform(host, nextViewport);
    },
    [host],
  );

  useEffect(() => {
    syncCanvasViewportTransform(host, defaultViewport);
    return startCanvasViewportDocumentSync(host);
  }, [defaultViewport, host]);

  return { defaultViewport, onViewportChange };
}

function hasMountedCanvasViewportRuntime(host: WorkspaceHost): boolean {
  return getWorkspaceXyflowRuntime(host).getInstance() !== null;
}

export function armLoadedDocumentFitView(
  host: WorkspaceHost,
  nextViewport: Viewport | null,
): void {
  if (nextViewport !== null || !hasMountedCanvasViewportRuntime(host)) {
    return;
  }
  getReactFlowStore(host).setState({
    fitViewOnInit: true,
    fitViewOnInitDone: false,
    fitViewOnInitOptions: undefined,
  });
}

export function applyLoadedDocumentViewport(
  host: WorkspaceHost,
  nextViewport: Viewport | null,
): void {
  if (nextViewport === null) {
    return;
  }
  const xyflowRuntime = getWorkspaceXyflowRuntime(host);
  const { minZoom, maxZoom } = getWorkspaceOptionsStore(host).getState();
  const clampedViewport = {
    x: nextViewport.x,
    y: nextViewport.y,
    zoom: clamp(nextViewport.zoom, minZoom, maxZoom),
  };
  if (!xyflowRuntime.getInstance()) {
    return;
  }

  getReactFlowStore(host).setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });
  syncCanvasViewportTransform(host, clampedViewport);
  void xyflowRuntime.setViewport(clampedViewport);
}
