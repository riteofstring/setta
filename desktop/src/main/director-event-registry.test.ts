import type { DirectorEvent, DirectorEventCursor } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { DirectorEventRegistry } from "./director-event-registry";
import type { DirectorEventStream } from "./director-event-stream";

describe("DirectorEventRegistry", () => {
  test("drops an in-flight event from the stream a replacement superseded", () => {
    const streams: Array<{
      cursor: DirectorEventCursor;
      sendEvent: (event: DirectorEvent) => void;
    }> = [];
    const sender = {
      id: 7,
      isDestroyed: () => false,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    };
    const fetchImpl: BackendFetch = vi.fn();
    const registry = new DirectorEventRegistry({
      backendConnection: () => ({
        baseURL: "http://127.0.0.1:41000",
        fetchImpl,
      }),
      startEventStream: (options) => {
        streams.push({ cursor: options.cursor, sendEvent: options.sendEvent });
        return inertStream();
      },
    });

    registry.subscribe(sender, { sequence: 3, streamId: "director:m3" });
    registry.subscribe(sender, { sequence: 9, streamId: "director:m9" });
    streams[0]?.sendEvent(selectionEvent("director:m3", 4));
    streams[1]?.sendEvent(selectionEvent("director:m9", 10));

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0]?.[1]).toMatchObject({
      sequence: 10,
      streamId: "director:m9",
    });
  });

  test("observes sender destruction only once across main-frame navigations", () => {
    const sender = {
      id: 8,
      isDestroyed: () => false,
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    };
    const registry = new DirectorEventRegistry({
      backendConnection: () => ({
        baseURL: "http://127.0.0.1:41000",
        fetchImpl: vi.fn(),
      }),
      startEventStream: () => inertStream(),
    });

    registry.subscribe(sender, { sequence: 3, streamId: "director:m3" });
    const navigation = sender.on.mock.calls[0]?.[1];
    navigation?.({}, "file:///index.html", false, true);
    registry.subscribe(sender, { sequence: 4, streamId: "director:m3" });

    expect(sender.once).toHaveBeenCalledTimes(1);
  });
});

function inertStream(): DirectorEventStream {
  return {
    done: Promise.resolve(),
    stop: async () => {},
  };
}

function selectionEvent(streamId: string, sequence: number): DirectorEvent {
  return {
    aggregatesUpdated: null,
    approvalUpdated: null,
    artifactUpdated: null,
    emittedAt: "2026-07-24T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    graphUpdated: null,
    kind: "director.selection.changed",
    resourceRequestUpdated: null,
    resyncRequired: null,
    schemaVersion: 1,
    selectionChanged: { selectedWorkstreamId: null },
    sequence,
    streamId,
    textDelta: null,
    workstreamRemoved: null,
    workstreamUpdated: null,
  };
}
