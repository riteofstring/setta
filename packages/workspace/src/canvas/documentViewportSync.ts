import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { Viewport } from "../document/types";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceHost } from "../workspaceHost";
import { useWorkspaceOptions } from "./options";
import { getWorkspaceOptionsStore } from "./options";
import { getReactFlowStore } from "./store";
import type { CoordinateExtent } from "./types";
import { clamp } from "./utils";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime";

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
    { equalityFn: _.isEqual },
  );
}

function getViewportFromTransform([x, y, zoom]: [number, number, number]) {
  return { x, y, zoom };
}

export function syncCanvasViewportTransform(
  host: WorkspaceHost,
  viewport: Viewport,
): void {
  const reactFlowStore = getReactFlowStore(host);
  const transform: [number, number, number] = [
    viewport.x,
    viewport.y,
    viewport.zoom,
  ];
  if (_.isEqual(reactFlowStore.getState().transform, transform)) {
    return;
  }
  reactFlowStore.setState({ transform });
}

export function useCanvasViewportDocumentSync() {
  const host = useWorkspaceHost();
  const [viewport, setViewport] = useState(() =>
    getInitialCanvasViewport(host),
  );
  const viewportRef = useRef(viewport);

  const onViewportChange = useCallback(
    (nextViewport: Viewport) => {
      if (!_.isEqual(viewportRef.current, nextViewport)) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
      syncCanvasViewportTransform(host, nextViewport);
    },
    [host],
  );

  useEffect(() => {
    const initialViewport = getInitialCanvasViewport(host);
    viewportRef.current = initialViewport;
    setViewport(initialViewport);
    syncCanvasViewportTransform(host, initialViewport);
    const stopDocumentSync = startCanvasViewportDocumentSync(host);
    const stopTransformSync = getReactFlowStore(host).subscribe(
      (state) => state.transform,
      (transform) => {
        const nextViewport = getViewportFromTransform(transform);
        if (_.isEqual(viewportRef.current, nextViewport)) {
          return;
        }
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      },
      { equalityFn: _.isEqual },
    );
    return () => {
      stopTransformSync();
      stopDocumentSync();
    };
  }, [host]);

  return { onViewportChange, viewport };
}

function getMountedCanvasZoomRuntime(host: WorkspaceHost) {
  const { d3Zoom, d3Selection } = getReactFlowStore(host).getState();
  if (!d3Zoom || !d3Selection) {
    return null;
  }
  return { d3Zoom, d3Selection };
}

function hasMountedCanvasViewportRuntime(host: WorkspaceHost): boolean {
  return (
    getWorkspaceXyflowRuntime(host).getInstance() !== null ||
    getMountedCanvasZoomRuntime(host) !== null
  );
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
  if (xyflowRuntime.getInstance()) {
    getReactFlowStore(host).setState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    syncCanvasViewportTransform(host, clampedViewport);
    void xyflowRuntime.setViewport(clampedViewport);
    return;
  }
  const runtime = getMountedCanvasZoomRuntime(host);
  if (runtime === null) {
    return;
  }

  getReactFlowStore(host).setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });

  const { width, height, translateExtent } = getReactFlowStore(host).getState();
  const nextTransform = zoomIdentity
    .translate(clampedViewport.x, clampedViewport.y)
    .scale(clampedViewport.zoom);
  const extent: CoordinateExtent = [
    [0, 0],
    [width, height],
  ];
  const constrainedTransform = runtime.d3Zoom.constrain()(
    nextTransform,
    extent,
    translateExtent,
  );
  runtime.d3Zoom.transform(runtime.d3Selection, constrainedTransform);
}
