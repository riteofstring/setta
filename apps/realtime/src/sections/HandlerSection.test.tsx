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

function setInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Expected a native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

  it("explains invalid binding shape and permits zero outputs", async () => {
    const project = makeProject();
    const runtimeActions = actions();
    await act(async () =>
      root.render(
        <RealtimeContext.Provider
          value={{
            actions: runtimeActions,
            error: null,
            project,
            runtime: initialRuntimeViewState,
            source: initialRuntimeSourceViewState,
          }}
        >
          <HandlerInspector data={{ bindingId: "binding-main" }} />
        </RealtimeContext.Provider>,
      ),
    );
    const argumentsInput = element.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Handler arguments"]',
    )!;
    const outputsInput = element.querySelector<HTMLInputElement>(
      'input[aria-label="Handler outputs"]',
    )!;
    const save = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent === "Save inputs and outputs",
    )!;

    await act(async () => {
      setInputValue(argumentsInput, '{"source":"$sections.missing.value"}');
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain(
      'Argument "source" has an invalid reference.',
    );

    await act(async () => {
      setInputValue(argumentsInput, "{}");
      setInputValue(outputsInput, "bad-name");
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain(
      "Outputs must be comma-separated valid Python names.",
    );

    await act(async () => {
      setInputValue(
        outputsInput,
        Array.from({ length: 129 }, (_, index) => `output_${index}`).join(","),
      );
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain(
      "Outputs cannot contain more than 128 entries.",
    );

    await act(async () => {
      setInputValue(outputsInput, "");
      save.click();
    });
    expect(runtimeActions.updateBinding).toHaveBeenCalledWith("binding-main", {
      arguments: {},
      outputNames: [],
    });
  });

  it("validates scheduling drafts before submitting them", async () => {
    const project = makeProject();
    const runtimeActions = actions();
    await act(async () =>
      root.render(
        <RealtimeContext.Provider
          value={{
            actions: runtimeActions,
            error: null,
            project,
            runtime: initialRuntimeViewState,
            source: initialRuntimeSourceViewState,
          }}
        >
          <HandlerInspector data={{ bindingId: "binding-main" }} />
        </RealtimeContext.Provider>,
      ),
    );
    const groupInput = element.querySelector<HTMLInputElement>(
      'input[aria-label="Concurrency group"]',
    )!;
    const debounceInput = element.querySelector<HTMLInputElement>(
      'input[aria-label="Debounce milliseconds"]',
    )!;
    const limitInput = element.querySelector<HTMLInputElement>(
      'input[aria-label="Concurrency limit"]',
    )!;
    const save = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent === "Save scheduling",
    )!;
    const edit = (input: HTMLInputElement, value: string) => {
      setInputValue(input, value);
    };

    await act(async () => {
      edit(groupInput, "not valid");
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain("Concurrency group must be");

    await act(async () => {
      edit(groupInput, "workers.main");
      edit(debounceInput, "1.5");
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain(
      "Debounce milliseconds must be a whole number",
    );

    await act(async () => {
      edit(debounceInput, "60000");
      edit(limitInput, "65");
      save.click();
    });
    expect(runtimeActions.updateBinding).not.toHaveBeenCalled();
    expect(element.textContent).toContain(
      "Concurrency limit must be a whole number from 1 through 64.",
    );

    await act(async () => {
      edit(limitInput, "64");
      save.click();
    });
    expect(runtimeActions.updateBinding).toHaveBeenCalledWith("binding-main", {
      scheduling: {
        concurrencyGroup: "workers.main",
        concurrencyLimit: 64,
        debounceMilliseconds: 60_000,
      },
    });
  });

  it("offers automatic startup only for change or snapshot rooted pipelines", async () => {
    const project = makeProject();
    const producer = {
      ...project.bindings[0]!,
      id: "binding-producer",
      outputs: { result: {} },
    };
    const target = {
      ...project.bindings[0]!,
      materialization: {
        retention: "lastSuccessful" as const,
        startup: "manual" as const,
      },
      trigger: {
        inputs: {
          input: { bindingId: producer.id, output: "result" },
        },
        kind: "join" as const,
        mode: "all" as const,
      },
    };
    project.sections["handler-producer"] = {
      ...project.sections["handler-main"]!,
      data: { bindingId: producer.id },
      id: "handler-producer",
    };
    project.layout.topLevelSections["handler-producer"] = {
      ...project.layout.topLevelSections["handler-main"]!,
      x: 920,
    };
    const runtimeActions = actions();
    const renderInspector = async (currentProject: typeof project) => {
      await act(async () =>
        root.render(
          <RealtimeContext.Provider
            value={{
              actions: runtimeActions,
              error: null,
              project: currentProject,
              runtime: initialRuntimeViewState,
              source: initialRuntimeSourceViewState,
            }}
          >
            <HandlerInspector data={{ bindingId: "binding-main" }} />
          </RealtimeContext.Provider>,
        ),
      );
    };
    await renderInspector({ ...project, bindings: [producer, target] });
    const startupOptions = () =>
      Array.from(
        element.querySelector<HTMLSelectElement>(
          'select[aria-label="Materialization startup"]',
        )!.options,
      ).map((option) => option.value);
    expect(startupOptions()).toEqual(["manual"]);

    await renderInspector({
      ...project,
      bindings: [
        {
          ...producer,
          trigger: {
            event: "change",
            kind: "event",
            sectionId: "input-main",
          },
        },
        target,
      ],
      revision: project.revision + 1,
    });
    expect(startupOptions()).toEqual([
      "manual",
      "always",
      "whenStale",
      "ifMissing",
    ]);
  });
});
