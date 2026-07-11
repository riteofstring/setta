import { BrowserWindow } from "electron";

import type { EasyRunEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { forwardEasyRunEventToWindows } from "./easy-run-event-forwarding";
import { startEasyRunEventStream, type EasyRunEventStream } from "./easy-run-event-stream";
import type { SessionRecorder } from "./session-recorder";

export function startEasyRunEventForwarding(options: {
  authToken: string;
  baseURL: string;
  fetchImpl: BackendFetch;
  recorder: SessionRecorder | null;
}): EasyRunEventStream {
  return startEasyRunEventStream({
    authToken: options.authToken,
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl,
    sendEvent: (event) => forwardEasyRunEvent(event, options.recorder),
  });
}

function forwardEasyRunEvent(event: EasyRunEvent, recorder: SessionRecorder | null) {
  recorder?.recordAppEvent("easy_run_event_forwarded", {
    easyRunId: event.easyRunId,
    eventId: event.eventId,
    sequence: event.sequence,
    streamId: event.streamId,
    type: event.type,
    workspaceId: event.workspaceId,
  });
  forwardEasyRunEventToWindows(BrowserWindow.getAllWindows(), event);
}
