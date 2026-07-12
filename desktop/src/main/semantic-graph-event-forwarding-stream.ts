import { BrowserWindow } from "electron";

import type { SemanticGraphChangeArea, SemanticGraphChangeEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type { SessionRecorder } from "./session-recorder";
import { forwardSemanticGraphEventToWindows } from "./semantic-graph-event-forwarding";
import {
  startSemanticGraphEventStream,
  type SemanticGraphEventStream,
} from "./semantic-graph-event-stream";

const semanticGraphAuditForwardIntervalMs = 100;
const semanticGraphAuditChangedAreas: SemanticGraphChangeArea[] = ["cartographer_audit"];

export function startSemanticGraphEventForwarding(options: {
  authToken: string;
  baseURL: string;
  fetchImpl: BackendFetch;
  recorder: SessionRecorder | null;
}): SemanticGraphEventStream {
  const forwarder = createSemanticGraphEventForwarder({
    forwardEvent: (event) =>
      forwardSemanticGraphEventToWindows(BrowserWindow.getAllWindows(), event),
    recordEvent: (event) => {
      options.recorder?.recordAppEvent("semantic_graph_event_forwarded", {
        changedAreas: event.changedAreas,
        eventId: event.eventId,
        sequence: event.sequence,
        streamId: event.streamId,
        workspaceId: event.workspaceId,
      });
    },
  });
  const stream = startSemanticGraphEventStream({
    authToken: options.authToken,
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl,
    sendEvent: forwarder.sendEvent,
  });
  return {
    done: stream.done,
    stop: async () => {
      await stream.stop();
      forwarder.flush();
    },
  };
}

export function createSemanticGraphEventForwarder(options: {
  forwardEvent: (event: SemanticGraphChangeEvent) => void;
  recordEvent: (event: SemanticGraphChangeEvent) => void;
}) {
  let pendingAuditEvent: SemanticGraphChangeEvent | null = null;
  let pendingAuditTimer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (pendingAuditTimer !== null) {
      clearTimeout(pendingAuditTimer);
      pendingAuditTimer = null;
    }
    if (pendingAuditEvent === null) {
      return;
    }
    const event = pendingAuditEvent;
    pendingAuditEvent = null;
    sendNow(event);
  }

  function sendNow(event: SemanticGraphChangeEvent) {
    options.recordEvent(event);
    options.forwardEvent(event);
  }

  function scheduleAuditFlush() {
    if (pendingAuditTimer !== null) {
      return;
    }
    pendingAuditTimer = setTimeout(() => {
      pendingAuditTimer = null;
      flush();
    }, semanticGraphAuditForwardIntervalMs);
  }

  return {
    flush,
    sendEvent(event: SemanticGraphChangeEvent) {
      if (!isAuditOnlySemanticGraphChange(event)) {
        flush();
        sendNow(event);
        return;
      }
      pendingAuditEvent =
        pendingAuditEvent === null
          ? event
          : mergeSemanticGraphAuditEvents(pendingAuditEvent, event);
      scheduleAuditFlush();
    },
  };
}

function isAuditOnlySemanticGraphChange(event: SemanticGraphChangeEvent) {
  return event.changedAreas.length === 1 && event.changedAreas[0] === "cartographer_audit";
}

function mergeSemanticGraphAuditEvents(
  previous: SemanticGraphChangeEvent,
  next: SemanticGraphChangeEvent,
) {
  return {
    ...next,
    cartographerPatchIds: uniqueStrings(previous.cartographerPatchIds, next.cartographerPatchIds),
    cartographerRunIds: uniqueStrings(previous.cartographerRunIds, next.cartographerRunIds),
    cartographerWindowIds: uniqueStrings(
      previous.cartographerWindowIds,
      next.cartographerWindowIds,
    ),
    changedAreas: [...semanticGraphAuditChangedAreas],
    createdSemanticEventIds: uniqueStrings(
      previous.createdSemanticEventIds,
      next.createdSemanticEventIds,
    ),
    semanticEdgeIds: uniqueStrings(previous.semanticEdgeIds, next.semanticEdgeIds),
    semanticNodeIds: uniqueStrings(previous.semanticNodeIds, next.semanticNodeIds),
    targetEntityIds: uniqueStrings(previous.targetEntityIds, next.targetEntityIds),
  };
}

function uniqueStrings(previous: string[], next: string[]) {
  return [...new Set([...previous, ...next])];
}
