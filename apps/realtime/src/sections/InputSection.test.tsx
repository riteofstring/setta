import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RealtimeContext, type RealtimeActions } from "../app/runtimeContext";
import {
  initialRuntimeViewState,
  type RuntimeViewState,
} from "../app/runtimeState";
import { projectWorkspaceDocument } from "../app/projectProjection";
import { makeProject } from "../testProject";
import { InputSection } from "./InputSection";

describe("input startup materialization", () => {
  let element: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
  });

  it("offers the canonical input value when each runtime session becomes ready", async () => {
    const project = makeProject();
    const section = projectWorkspaceDocument(project).sections["input-main"]!;
    const initialize = vi.fn<RealtimeActions["initialize"]>(async () => true);
    const actions = {
      applyRuntimeSource: vi.fn(async () => true),
      cancel: vi.fn(() => true),
      connectGraph: vi.fn(async () => true),
      commitSectionData: vi.fn(async () => true),
      emit: vi.fn(() => true),
      createHandler: vi.fn(async () => true),
      deleteGraphEdges: vi.fn(async () => true),
      initialize,
      reload: vi.fn(async () => true),
      reconnectGraph: vi.fn(async () => true),
      reportError: vi.fn(),
      uploadContent: vi.fn(),
      updateBinding: vi.fn(async () => true),
    } satisfies RealtimeActions;
    const runtime = {
      ...initialRuntimeViewState,
      connection: "connected",
      sessionId: "session-one",
      workerState: "ready",
    } satisfies RuntimeViewState;
    const render = (nextRuntime: RuntimeViewState) => (
      <RealtimeContext.Provider
        value={{
          actions,
          error: null,
          project,
          runtime: nextRuntime,
          source: {
            activationRejected: false,
            document: null,
            notice: null,
            status: "unavailable",
          },
        }}
      >
        <InputSection section={section} />
      </RealtimeContext.Provider>
    );

    await act(async () => root.render(render(runtime)));
    expect(initialize).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenLastCalledWith(
      "input-main",
      "change",
      expect.any(Function),
    );
    expect(await initialize.mock.calls[0]![2]()).toEqual({ value: "hello" });

    await act(async () =>
      root.render(render({ ...runtime, sessionId: "session-two" })),
    );
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
