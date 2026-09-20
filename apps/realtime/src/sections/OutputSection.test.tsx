import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectWorkspaceDocument } from "../app/projectProjection";
import { RealtimeContext, type RealtimeActions } from "../app/runtimeContext";
import {
  initialRuntimeViewState,
  runtimeValueKey,
  type RuntimeViewState,
} from "../app/runtimeState";
import type { InvocationStatus } from "../api/generatedContract";
import { makeProject } from "../testProject";
import { OutputSection } from "./OutputSection";

function invocation(
  state: InvocationStatus["state"],
  error: InvocationStatus["error"] = null,
): InvocationStatus {
  return {
    error,
    identity: {
      bindingId: "binding-main",
      invocationId: `invocation-${state}`,
      runId: "run-main",
      sequence: 2,
      sessionId: "session-main",
    },
    state,
  };
}

describe("materialized output presentation", () => {
  let element: HTMLDivElement;
  let root: Root;
  const actions = {
    applyRuntimeSource: vi.fn(async () => true),
    cancel: vi.fn(() => true),
    connectGraph: vi.fn(async () => true),
    commitSectionData: vi.fn(async () => true),
    emit: vi.fn(() => true),
    createHandler: vi.fn(async () => true),
    deleteGraphEdges: vi.fn(async () => true),
    initialize: vi.fn(async () => true),
    reload: vi.fn(async () => true),
    reconnectGraph: vi.fn(async () => true),
    reportError: vi.fn(),
    uploadContent: vi.fn(),
    updateBinding: vi.fn(async () => true),
  } satisfies RealtimeActions;

  beforeEach(() => {
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
  });

  it("communicates queued and running initialization before a value exists", async () => {
    const project = makeProject();
    project.bindings[0]!.materialization = {
      retention: "lastSuccessful",
      startup: "ifMissing",
    };
    const section = projectWorkspaceDocument(project).sections["output-main"]!;
    const render = (runtime: RuntimeViewState) => (
      <RealtimeContext.Provider
        value={{
          actions,
          error: null,
          project,
          runtime,
          source: {
            activationRejected: false,
            document: null,
            notice: null,
            status: "unavailable",
          },
        }}
      >
        <OutputSection section={section} />
      </RealtimeContext.Provider>
    );

    await act(async () =>
      root.render(
        render({
          ...initialRuntimeViewState,
          connection: "connected",
          invocations: { "invocation-queued": invocation("queued") },
          sessionId: "session-main",
          workerState: "ready",
        }),
      ),
    );
    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      "Initialization queued",
    );
    expect(element.querySelector(".realtime-output-value")).toBeNull();

    await act(async () =>
      root.render(
        render({
          ...initialRuntimeViewState,
          connection: "connected",
          invocations: { "invocation-running": invocation("running") },
          sessionId: "session-main",
          workerState: "ready",
        }),
      ),
    );
    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      "Initializing",
    );
  });

  it("keeps saved output visible while refresh runs or fails", async () => {
    const project = makeProject();
    project.bindings[0]!.materialization = {
      retention: "lastSuccessful",
      startup: "whenStale",
    };
    const section = projectWorkspaceDocument(project).sections["output-main"]!;
    const valueKey = runtimeValueKey("output-main", "value");
    const render = (current?: InvocationStatus) => (
      <RealtimeContext.Provider
        value={{
          actions,
          error: null,
          project,
          runtime: {
            ...initialRuntimeViewState,
            connection: "connected",
            invocations:
              current === undefined
                ? {}
                : { [current.identity.invocationId]: current },
            retainedByBinding: { "binding-main": true },
            sessionId: "session-main",
            values: { [valueKey]: "saved value" },
            workerState: "ready",
          },
          source: {
            activationRejected: false,
            document: null,
            notice: null,
            status: "unavailable",
          },
        }}
      >
        <OutputSection section={section} />
      </RealtimeContext.Provider>
    );

    await act(async () => root.render(render()));
    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      "Saved result",
    );
    expect(element.querySelector(".realtime-output-value")?.textContent).toBe(
      "saved value",
    );

    await act(async () => root.render(render(invocation("streaming"))));
    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      "Saved result · Updating",
    );
    expect(element.querySelector(".realtime-output-value")?.textContent).toBe(
      "saved value",
    );

    await act(async () =>
      root.render(
        render(
          invocation("failed", {
            code: "refresh_failed",
            message: "Refresh failed",
          }),
        ),
      ),
    );
    expect(element.querySelector('[role="status"]')?.textContent).toBe(
      "Saved result · Refresh failed",
    );
    expect(element.querySelector(".realtime-output-value")?.textContent).toBe(
      "saved value",
    );
  });
});
