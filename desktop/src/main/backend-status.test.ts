import { ipcEvents } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { createBackendStatusBroadcaster } from "./backend-status";

describe("backend status broadcaster", () => {
  test("emits process status updates to every window", () => {
    const first = statusWindow();
    const second = statusWindow();
    const broadcaster = createBackendStatusBroadcaster(() => [first, second]);
    const status = {
      message: "Backend online",
      mode: "spawned" as const,
      status: "online" as const,
      url: "http://127.0.0.1:41000",
    };

    broadcaster.emitProcessStatus(status);

    expect(first.webContents.send).toHaveBeenCalledWith(ipcEvents.backendProcessStatus, status);
    expect(second.webContents.send).toHaveBeenCalledWith(ipcEvents.backendProcessStatus, status);
    expect(broadcaster.currentProcessStatus()).toEqual(status);
  });

  test("emits event stream status and replays current statuses to a new window", () => {
    const first = statusWindow();
    const next = statusWindow();
    const broadcaster = createBackendStatusBroadcaster(() => [first]);
    const processStatus = { message: "Backend failed", status: "failed" as const };
    const eventStreamStatus = {
      lastSequence: 4,
      lastStreamId: "event_stream_api",
      message: "Resyncing",
      status: "resyncing" as const,
    };

    broadcaster.emitProcessStatus(processStatus);
    broadcaster.emitEventStreamStatus(eventStreamStatus);
    broadcaster.sendToWindow(next);

    expect(first.webContents.send).toHaveBeenCalledWith(
      ipcEvents.backendEventStreamStatus,
      eventStreamStatus,
    );
    expect(next.webContents.send).toHaveBeenCalledWith(
      ipcEvents.backendProcessStatus,
      processStatus,
    );
    expect(next.webContents.send).toHaveBeenCalledWith(
      ipcEvents.backendEventStreamStatus,
      eventStreamStatus,
    );
  });
});

function statusWindow() {
  return {
    webContents: {
      send: vi.fn(),
    },
  };
}
