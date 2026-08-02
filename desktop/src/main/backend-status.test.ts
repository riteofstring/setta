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

  test("replays the current process status to a new window", () => {
    const first = statusWindow();
    const next = statusWindow();
    const broadcaster = createBackendStatusBroadcaster(() => [first]);
    const processStatus = { message: "Backend failed", status: "failed" as const };
    broadcaster.emitProcessStatus(processStatus);
    broadcaster.sendToWindow(next);
    expect(next.webContents.send).toHaveBeenCalledWith(
      ipcEvents.backendProcessStatus,
      processStatus,
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
