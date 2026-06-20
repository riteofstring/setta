import type { SemanticGraphChangeEvent } from "@generated/backend";
import { ipcEvents } from "@shared/ipc";
import type { SettaAPI } from "@shared/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("preload semantic graph events", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("electron");
    vi.unstubAllEnvs();
    vi.stubEnv("SETTA_E2E", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_DEBUG", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE", "");
    vi.stubEnv("SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT", "");
  });

  test("decodes semantic graph change events from main", async () => {
    const exposed: Record<string, unknown> = {};
    const on = vi.fn();
    const removeListener = vi.fn();
    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: (name: string, api: unknown) => {
          exposed[name] = api;
        },
      },
      ipcRenderer: {
        invoke: vi.fn(),
        on,
        removeListener,
      },
    }));

    await import("./index");

    const api = exposed.setta as SettaAPI;
    const listener = vi.fn();
    const event: SemanticGraphChangeEvent = {
      cartographerPatchIds: [],
      cartographerRunIds: ["cartographer_run_api"],
      cartographerWindowIds: [],
      changedAreas: ["graph", "cartographer_audit"],
      createdSemanticEventIds: ["semantic_event_api"],
      eventId: "semantic_graph_changes:1",
      occurredAt: "2026-06-11T12:00:00Z",
      schemaVersion: 1,
      semanticEdgeIds: [],
      semanticNodeIds: ["node_api"],
      sequence: 1,
      streamId: "semantic_graph_changes",
      targetEntityIds: ["node_api"],
      type: "semantic_graph.changed",
      workspaceId: "workspace_api",
    };

    const unsubscribe = api.semanticGraph.onEvent(listener);
    const handler = on.mock.calls.find((call) => call[0] === ipcEvents.semanticGraphEvent)?.[1];
    expect(handler).toBeTypeOf("function");
    handler?.({}, event);
    unsubscribe();

    expect(on).toHaveBeenCalledWith(ipcEvents.semanticGraphEvent, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(event);
    expect(removeListener).toHaveBeenCalledWith(ipcEvents.semanticGraphEvent, handler);
  });
});
