import { BrowserWindow } from "electron";

import type { WorkspaceActivityEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { forwardWorkspaceActivityEventToWindows } from "./workspace-activity-event-forwarding";
import {
  startWorkspaceActivityEventStream,
  type WorkspaceActivityEventStream,
} from "./workspace-activity-event-stream";
import type { SessionRecorder } from "./session-recorder";

export function startWorkspaceActivityEventForwarding(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  recorder: SessionRecorder | null;
}): WorkspaceActivityEventStream {
  return startWorkspaceActivityEventStream({
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl,
    sendEvent: (event) => forwardWorkspaceActivityEvent(event, options.recorder),
  });
}

function forwardWorkspaceActivityEvent(
  event: WorkspaceActivityEvent,
  recorder: SessionRecorder | null,
) {
  recorder?.recordAppEvent("workspace_activity_event_forwarded", {
    activityId: event.delta?.activityId ?? "",
    eventId: event.eventId,
    revision: event.revision,
    sequence: event.sequence,
    streamId: event.streamId,
    type: event.type,
    workspaceId: event.workspaceId,
  });
  forwardWorkspaceActivityEventToWindows(BrowserWindow.getAllWindows(), event);
}
