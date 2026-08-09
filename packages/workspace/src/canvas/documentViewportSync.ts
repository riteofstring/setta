import _ from "lodash";
import { useEffect } from "react";
import { useWorkspaceDocument } from "../document/stores";
import type { Viewport } from "../document/types";
import { useReactFlow } from "./store";

// The document/canvas viewport seam. The reference restores a saved viewport directly and arms
// fit-on-init when the loaded document has none (`applyViewportFromProjectState`), then mirrors
// every transform change back into the canonical config while debouncing only the backend send.
// The package keeps the same canonical mirror; the Phase 2 change-callback seam owns notifying
// the host.
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
        newState.fitViewOnInitDone && (newState.fitViewOnInit || prevState.fitViewOnInit);
      if (autoFitTransition && newState.fitViewOnInit) {
        useReactFlow.setState({ fitViewOnInit: false });
        return;
      }
      const [x, y, zoom] = newState.transform;
      useWorkspaceDocument.setState({ viewport: { x, y, zoom } });
    },
    { equalityFn: _.isEqual },
  );
}

export function useCanvasViewportDocumentSync() {
  useEffect(() => startCanvasViewportDocumentSync(), []);
}
