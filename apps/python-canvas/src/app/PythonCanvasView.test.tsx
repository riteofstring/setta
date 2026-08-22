import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceHost } from "@setta/workspace";

import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
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

function renderView(
  announcement:
    | { kind: "idle" }
    | { description: string; kind: "pending" }
    | { kind: "error"; message: string },
  pythonTargetCompletionError: string | null = null,
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
      />,
    );
  });
  return container;
}
