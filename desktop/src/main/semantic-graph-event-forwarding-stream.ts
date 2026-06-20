import { BrowserWindow } from "electron";

import type { BackendFetch } from "@shared/backend-runtime";
import type { SessionRecorder } from "./session-recorder";
import { forwardSemanticGraphEventToWindows } from "./semantic-graph-event-forwarding";
import {
  startSemanticGraphEventStream,
  type SemanticGraphEventStream,
} from "./semantic-graph-event-stream";

export function startSemanticGraphEventForwarding(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  recorder: SessionRecorder | null;
}): SemanticGraphEventStream {
  return startSemanticGraphEventStream({
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl,
    sendEvent: (event) => {
      options.recorder?.recordAppEvent("semantic_graph_event_forwarded", {
        changedAreas: event.changedAreas,
        eventId: event.eventId,
        sequence: event.sequence,
        streamId: event.streamId,
        workspaceId: event.workspaceId,
      });
      forwardSemanticGraphEventToWindows(BrowserWindow.getAllWindows(), event);
    },
  });
}
