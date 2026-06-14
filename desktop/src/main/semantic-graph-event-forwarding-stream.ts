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
        semanticRuntimeDeltaBytes: event.semanticRuntimeDelta?.payloadBudget.byteSize ?? 0,
        semanticRuntimeDeltaMaxBytes: event.semanticRuntimeDelta?.payloadBudget.maxByteSize ?? 0,
        semanticRuntimeDeltaTruncatedStringCount:
          event.semanticRuntimeDelta?.payloadBudget.truncatedStringCount ?? 0,
        semanticRuntimeRevision: event.semanticRuntimeRevision,
        semanticRuntimeSnapshotRequired: event.semanticRuntimeSnapshotRequired,
        streamId: event.streamId,
        workspaceId: event.workspaceId,
      });
      forwardSemanticGraphEventToWindows(BrowserWindow.getAllWindows(), event);
    },
  });
}
