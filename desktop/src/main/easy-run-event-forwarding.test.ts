import type { EasyRunEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { forwardEasyRunEventToWindows } from "./easy-run-event-forwarding";

describe("easy-run event forwarding", () => {
  test("forwards easy-run events only to live windows", () => {
    const event = easyRunEvent(1);
    const liveSend = vi.fn();
    const destroyedWindowSend = vi.fn();
    const destroyedContentsSend = vi.fn();

    forwardEasyRunEventToWindows(
      [
        windowTarget(false, false, liveSend),
        windowTarget(true, false, destroyedWindowSend),
        windowTarget(false, true, destroyedContentsSend),
      ],
      event,
    );

    expect(liveSend).toHaveBeenCalledWith(ipcEvents.easyRunEvent, event);
    expect(destroyedWindowSend).not.toHaveBeenCalled();
    expect(destroyedContentsSend).not.toHaveBeenCalled();
  });
});

function windowTarget(
  destroyed: boolean,
  contentsDestroyed: boolean,
  send: (channel: string, event: EasyRunEvent) => void,
) {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => contentsDestroyed,
      send,
    },
  };
}

function easyRunEvent(sequence: number): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: "easy_run_api",
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `easyrun_events:${sequence}`,
    highlightCreated: null,
    resyncRequired: null,
    runUpdated: {
      run: {
        activeAgentCount: 1,
        artifactCount: 0,
        conversationId: "conversation_api",
        endedAt: null,
        error: null,
        highlightCount: 0,
        id: "easy_run_api",
        narratorStatus: "ok",
        requestText: "Do the work",
        startedAt: "2026-07-08T12:00:00Z",
        status: "working",
        summary: null,
        workspaceId: "workspace_api",
      },
    },
    schemaVersion: 1,
    sequence,
    streamId: "easyrun_events",
    type: "easyrun.run.updated",
    workspaceId: "workspace_api",
  };
}
