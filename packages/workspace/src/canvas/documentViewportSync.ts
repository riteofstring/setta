import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useEffect } from "react";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { useWorkspaceDocument } from "../document/stores";
import type { Viewport } from "../document/types";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
import type { CoordinateExtent } from "./types";
import { clamp } from "./utils";

// The document/canvas viewport seam. The reference restores a saved viewport directly and arms
// fit-on-init when the loaded document has none (`applyViewportFromProjectState`), then mirrors
// every transform change back into the canonical config while debouncing only the backend send.
// The package keeps the same canonical mirror and notifies the host through the document-change
// callback on each mirrored change.
export function getInitialCanvasViewport(): Viewport {
  const viewport = useWorkspaceDocument.getState().viewport;
  if (viewport === null) {
    useReactFlow.setState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: undefined,
    });
    return { x: 0, y: 0, zoom: 1 };
  }
  // The saved-camera branch normalizes the fit flags like the reference's
  // `applyViewportFromProjectState`: a re-mount after an unmounted-while-armed fit must not
  // complete that stale fit over the saved viewport. This runs before the viewport-sync
  // subscription mounts, so the flag writes cannot mirror into the document.
  useReactFlow.setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });
  return viewport;
}

export function startCanvasViewportDocumentSync() {
  return useReactFlow.subscribe(
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
        useReactFlow.setState({ fitViewOnInit: false });
        return;
      }
      const [x, y, zoom] = newState.transform;
      useWorkspaceDocument.setState({ viewport: { x, y, zoom } });
      notifyWorkspaceDocumentChange();
    },
    { equalityFn: _.isEqual },
  );
}

export function useCanvasViewportDocumentSync() {
  useEffect(() => startCanvasViewportDocumentSync(), []);
}

function getMountedCanvasZoomRuntime() {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  if (!d3Zoom || !d3Selection) {
    return null;
  }
  return { d3Zoom, d3Selection };
}

// The two halves of the mounted re-load camera transition, mirroring the branch structure of the
// reference's `applyViewportFromProjectState` (which handles view-mode viewport swaps while the
// canvas stays mounted). The load orchestrator calls the arm before the document publication so
// the sync mirror triggered by the flag flip lands in the outgoing document state, and the apply
// after it. Both are no-ops when the canvas is not mounted: the mount path reads the loaded
// document through `getInitialCanvasViewport`.
export function armLoadedDocumentFitView(nextViewport: Viewport | null): void {
  if (nextViewport !== null || getMountedCanvasZoomRuntime() === null) {
    return;
  }
  useReactFlow.setState({
    fitViewOnInit: true,
    fitViewOnInitDone: false,
    fitViewOnInitOptions: undefined,
  });
}

export function applyLoadedDocumentViewport(
  nextViewport: Viewport | null,
): void {
  if (nextViewport === null) {
    return;
  }
  const runtime = getMountedCanvasZoomRuntime();
  if (runtime === null) {
    return;
  }
  // A loaded camera cancels any pending fit-on-init, as in the reference's saved-viewport branch.
  useReactFlow.setState({
    fitViewOnInit: false,
    fitViewOnInitDone: true,
    fitViewOnInitOptions: undefined,
  });
  // Unlike the reference (which relies on a keyed remount for full reloads and writes the
  // transform state directly for view-mode swaps), the package pushes the transform through
  // d3-zoom so the element's internal zoom state stays consistent with the store. The transform
  // is constrained exactly as the mount-time initialization constrains the initial viewport.
  const { width, height, translateExtent } = useReactFlow.getState();
  const { minZoom, maxZoom } = useWorkspaceOptions.getState();
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
