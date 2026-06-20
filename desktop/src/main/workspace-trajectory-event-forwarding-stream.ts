import { BrowserWindow } from "electron";

import type { BackendFetch } from "@shared/backend-runtime";
import type { SessionRecorder } from "./session-recorder";
import { forwardWorkspaceTrajectoryRuntimeEventToWindows } from "./workspace-trajectory-event-forwarding";
import {
  startWorkspaceTrajectoryRuntimeEventStream,
  type WorkspaceTrajectoryRuntimeEventStream,
} from "./workspace-trajectory-event-stream";

export function startWorkspaceTrajectoryRuntimeEventForwarding(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  recorder: SessionRecorder | null;
}): WorkspaceTrajectoryRuntimeEventStream {
  return startWorkspaceTrajectoryRuntimeEventStream({
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl,
    sendEvent: (event) => {
      options.recorder?.recordAppEvent("workspace_trajectory_runtime_event_forwarded", {
        deltaBytes: event.delta?.payloadBudget.byteSize ?? 0,
        deltaMaxBytes: event.delta?.payloadBudget.maxByteSize ?? 0,
        eventId: event.eventId,
        revision: event.revision,
        sequence: event.sequence,
        snapshotRequired: event.snapshotRequired,
        streamId: event.streamId,
        workspaceId: event.workspaceId,
      });
      forwardWorkspaceTrajectoryRuntimeEventToWindows(BrowserWindow.getAllWindows(), event);
    },
  });
}
