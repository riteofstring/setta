import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useEffect } from "react";
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

export function useCanvasViewportDocumentSync() {
  const host = useWorkspaceHost();
  useEffect(() => startCanvasViewportDocumentSync(host), [host]);
}

function getMountedCanvasZoomRuntime(host: WorkspaceHost) {
  const { d3Zoom, d3Selection } = getReactFlowStore(host).getState();
  if (!d3Zoom || !d3Selection) {
    return null;
  }
  return { d3Zoom, d3Selection };
}

export function armLoadedDocumentFitView(
  host: WorkspaceHost,
  nextViewport: Viewport | null,
): void {
  if (nextViewport !== null || getMountedCanvasZoomRuntime(host) === null) {
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
  const { minZoom, maxZoom } = getWorkspaceOptionsStore(host).getState();
  const nextTransform = zoomIdentity
    .translate(nextViewport.x, nextViewport.y)
    .scale(clamp(nextViewport.zoom, minZoom, maxZoom));
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
