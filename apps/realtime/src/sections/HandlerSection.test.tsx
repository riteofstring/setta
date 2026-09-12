import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectWorkspaceDocument } from "../app/projectProjection";
import { RealtimeContext, type RealtimeActions } from "../app/runtimeContext";
import { initialRuntimeSourceViewState } from "../app/runtimeContext";
import { initialRuntimeViewState } from "../app/runtimeState";
import { makeProject } from "../testProject";
import { HandlerInspector } from "./HandlerInspector";
import { HandlerSection } from "./HandlerSection";

function actions(): RealtimeActions {
  return {
    applyRuntimeSource: vi.fn(async () => true),
    cancel: vi.fn(() => true),
    commitSectionData: vi.fn(async () => true),
    connectGraph: vi.fn(async () => true),
    createHandler: vi.fn(async () => true),
    deleteGraphEdges: vi.fn(async () => true),
    emit: vi.fn(() => true),
    initialize: vi.fn(async () => true),
    reconnectGraph: vi.fn(async () => true),
    reload: vi.fn(async () => true),
    reportError: vi.fn(),
    updateBinding: vi.fn(async () => true),
    uploadContent: vi.fn(),
  };
}

describe("handler section authoring", () => {
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

  it("presents discovery, waiting state, run lineage, and cancellation", async () => {
    const project = makeProject();
    const section = projectWorkspaceDocument(project).sections["handler-main"]!;
    const runtimeActions = actions();
    const identity = {
      bindingId: "binding-main",
      invocationId: "invocation-main",
      runId: "run-lineage-main",
      sequence: 3,
      sessionId: "session-main",
    };

    await act(async () =>
      root.render(
        <RealtimeContext.Provider
          value={{
            actions: runtimeActions,
            error: null,
            project,
            runtime: {
              ...initialRuntimeViewState,
              handlers: ["run"],
              invocations: {
                "binding-main": { error: null, identity, state: "waiting" },
              },
              updates: {
                "binding-main": {
                  identity,
                  message: "Waiting for input",
                  outputs: {},
                  progress: 0.25,
                  updateSequence: 1,
                },
              },
            },
            source: initialRuntimeSourceViewState,
          }}
        >
          <HandlerSection section={section} />
        </RealtimeContext.Provider>,
      ),
    );

    expect(element.textContent).toContain("available");
    expect(element.textContent).toContain("waiting");
    expect(element.textContent).toContain("Run run-lineage-main");
    expect(element.textContent).toContain("Waiting for input");
    await act(async () =>
      element.querySelector<HTMLButtonElement>("button")?.click(),
    );
    expect(runtimeActions.cancel).toHaveBeenCalledWith(identity);
  });

  it("edits the handler through the app-owned inspector", async () => {
    const project = makeProject();
    const runtimeActions = actions();
    await act(async () =>
      root.render(
        <RealtimeContext.Provider
          value={{
            actions: runtimeActions,
            error: null,
            project,
            runtime: {
              ...initialRuntimeViewState,
              handlers: ["run", "render"],
            },
            source: initialRuntimeSourceViewState,
          }}
        >
          <HandlerInspector data={{ bindingId: "binding-main" }} />
        </RealtimeContext.Provider>,
      ),
    );
    const select = element.querySelector<HTMLSelectElement>(
      'select[aria-label="Handler function"]',
    )!;

    await act(async () => {
      select.value = "render";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(runtimeActions.updateBinding).toHaveBeenCalledWith("binding-main", {
      handler: "render",
    });
  });
});
