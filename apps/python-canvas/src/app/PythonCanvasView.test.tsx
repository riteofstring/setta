import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceHost } from "@setta/workspace";

import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import type { GeneratedPythonTerminalContextValue } from "./generatedPythonTerminalContext";
import type { GeneratedPythonTerminalState } from "./generatedPythonTerminalController";
import { PythonCanvasView } from "./PythonCanvasView";

vi.mock("@setta/workspace", () => ({
  WorkspaceCanvas: () => <div data-testid="workspace-canvas" />,
  WorkspaceProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
});

describe("PythonCanvasView", () => {
  it("keeps app mutation feedback in an off-layout live region", () => {
    const view = renderView({
      kind: "error",
      message: "Unable to save the project. Try again.",
    });

    const error = view.querySelector("#python-canvas-mutation-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe("Unable to save the project. Try again.");
    expect(view.querySelector(".python-canvas-project-controls")).toBeNull();
    expect(view.querySelector(".python-canvas-empty-state")).toBeNull();
  });

  it("keeps pending and unavailable-provider states explicit", () => {
    const view = renderView({
      description: "Saving the Python target.",
      kind: "pending",
    });

    const status = view.querySelector("[role='status']");
    expect(status?.textContent).toBe("Saving the Python target.");
    expect(status?.getAttribute("aria-busy")).toBe("true");
  });

  it("gives target completion feedback a stable description ID", () => {
    const view = renderView(
      { kind: "idle" },
      "Unable to load Python target completions. Try again.",
    );

    const error = view.querySelector("#python-canvas-target-completion-error");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toBe(
      "Unable to load Python target completions. Try again.",
    );
  });

  it("keeps terminal failures separate from project mutation feedback", () => {
    const view = renderView(
      { kind: "idle" },
      null,
      "Unable to attach the terminal. Try again.",
    );

    const terminalError = view.querySelector("#python-canvas-terminal-error");
    expect(terminalError?.getAttribute("role")).toBe("alert");
    expect(terminalError?.textContent).toBe(
      "Unable to attach the terminal. Try again.",
    );
    expect(
      view.querySelector("#python-canvas-mutation-error")?.textContent,
    ).toBe("");
  });
});

const mutationContext: PythonCanvasMutationContextValue = {
  callableCompletionError: () => null,
  callableCompletionProvider: () => undefined,
  callableDraft: () => "",
  callableMutationError: () => null,
  dictionaryMutationError: () => null,
  listMutationError: () => null,
  onCallableAlternateCommit: vi.fn(),
  onCallableCommit: vi.fn(),
  onCallableDraftChange: vi.fn(),
  onCallableRevert: vi.fn(),
  onDictionaryEntryExpressionChange: vi.fn(),
  onDictionaryEntryNameChange: vi.fn(),
  onListDecrement: vi.fn(),
  onListIncrement: vi.fn(),
  onParameterExpressionChange: vi.fn(),
  onParameterNameChange: vi.fn(),
  parameterAuthoringPending: () => false,
};

const terminalContext: GeneratedPythonTerminalContextValue = {
  actions: {
    close: vi.fn(),
    create: vi.fn(),
    hide: vi.fn(),
    reportStreamError: vi.fn(),
    resize: vi.fn(),
    run: vi.fn(),
    show: vi.fn(),
  },
  state: {
    creating: false,
    error: null,
    projectId: null,
    sessionKey: null,
    status: "absent",
    terminalHeight: 220,
  } satisfies GeneratedPythonTerminalState,
};

function renderView(
  announcement:
    | { kind: "idle" }
    | { description: string; kind: "pending" }
    | { kind: "error"; message: string },
  pythonTargetCompletionError: string | null = null,
  terminalError: string | null = null,
): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasView
        announcement={announcement}
        mutationContext={mutationContext}
        pythonTargetCompletionError={pythonTargetCompletionError}
        state={{ host: {} as WorkspaceHost, kind: "ready" }}
        terminalContext={{
          ...terminalContext,
          state: { ...terminalContext.state, error: terminalError },
        }}
      />,
    );
  });
  return container;
}
