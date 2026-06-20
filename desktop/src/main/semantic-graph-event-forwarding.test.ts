import type { SemanticGraphChangeEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import { describe, expect, test, vi } from "vitest";

import { forwardSemanticGraphEventToWindows } from "./semantic-graph-event-forwarding";

describe("semantic graph event forwarding", () => {
  test("forwards backend semantic graph events to live renderer windows", () => {
    const liveSend = vi.fn();
    const destroyedSend = vi.fn();
    const destroyedContentsSend = vi.fn();
    const event = semanticGraphEvent();

    forwardSemanticGraphEventToWindows(
      [
        {
          isDestroyed: () => false,
          webContents: { isDestroyed: () => false, send: liveSend },
        },
        {
          isDestroyed: () => true,
          webContents: { isDestroyed: () => false, send: destroyedSend },
        },
        {
          isDestroyed: () => false,
          webContents: { isDestroyed: () => true, send: destroyedContentsSend },
        },
      ] as never,
      event,
    );

    expect(liveSend).toHaveBeenCalledWith(ipcEvents.semanticGraphEvent, event);
    expect(destroyedSend).not.toHaveBeenCalled();
    expect(destroyedContentsSend).not.toHaveBeenCalled();
  });
});

function semanticGraphEvent(): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["graph"],
    createdSemanticEventIds: ["semantic_event_api"],
    eventId: "semantic_graph_changes:1",
    occurredAt: "2026-06-11T12:00:00Z",
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: ["node_api"],
    semanticRuntimeDelta: null,
    semanticRuntimeRevision: 1,
    semanticRuntimeSnapshotRequired: false,
    sequence: 1,
    streamId: "semantic_graph_changes",
    targetEntityIds: ["node_api"],
    type: "semantic_graph.changed",
    workspaceId: "workspace_api",
  };
}
