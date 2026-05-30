import type { ChatEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { forwardChatEventToWindows } from "./chat-event-forwarding";

describe("chat event forwarding", () => {
  test("forwards backend chat events to live renderer windows", () => {
    const liveSend = vi.fn();
    const destroyedSend = vi.fn();
    const event = chatEvent();

    forwardChatEventToWindows(
      [
        {
          isDestroyed: () => false,
          webContents: { send: liveSend },
        },
        {
          isDestroyed: () => true,
          webContents: { send: destroyedSend },
        },
      ],
      event,
    );

    expect(liveSend).toHaveBeenCalledWith(ipcEvents.chatEvent, event);
    expect(destroyedSend).not.toHaveBeenCalled();
  });
});

function chatEvent(): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: "1",
    payload: {
      currentSequence: 0,
      earliestSequence: 0,
      reason: "test",
      requestedSequence: 0,
    },
    runId: "",
    schemaVersion: 1,
    sequence: 1,
    type: "chat.resync_required",
    workspaceId: "workspace_api",
  };
}
