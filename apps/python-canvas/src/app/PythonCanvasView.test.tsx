import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceHost,
  WorkspaceShellTabDefinition,
  WorkspaceShellViewState,
} from "@setta/workspace";

import type { PythonCanvasMutationContextValue } from "./PythonCanvasMutationContext";
import type { GeneratedPythonTerminalContextValue } from "./generatedPythonTerminalContext";
import type { GeneratedPythonTerminalState } from "./generatedPythonTerminalController";
import { PythonCanvasView } from "./PythonCanvasView";
import {
  PYTHON_CANVAS_SHELL_PREFERENCE_KEY,
  PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
} from "./pythonCanvasShellPreferences";

type ShellPropsCapture = {
  ariaLabel?: string;
  leadingPaneShiftsCanvas?: boolean;
  leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  onViewStateChange: (nextState: WorkspaceShellViewState) => void;
  trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  viewState: WorkspaceShellViewState;
};

const workspaceMocks = vi.hoisted(() => ({
  providerHosts: [] as Array<WorkspaceHost>,
  shellProps: [] as Array<ShellPropsCapture>,
}));

vi.mock("@setta/workspace", () => ({
  WORKSPACE_INSPECTOR_TAB_ID: "inspector",
  WORKSPACE_OUTLINE_TAB_ID: "outline",
  createWorkspaceShellViewState: () => ({
    leading: {
      rememberedNonFullWidth: 335,
      selectedTabId: "outline",
      visible: true,
      width: 335,
    },
    outline: { collapsedGroupIds: [], focusedSectionId: null },
    trailing: {
      rememberedNonFullWidth: 500,
      selectedTabId: "inspector",
      visible: false,
      width: 500,
    },
  }),
  WorkspaceShell: (props: ShellPropsCapture) => {
    workspaceMocks.shellProps.push(props);
    return (
      <button
        data-testid="workspace-shell"
        onClick={() =>
          props.onViewStateChange({
            ...props.viewState,
            trailing: { ...props.viewState.trailing, visible: true },
          })
        }
        type="button"
      >
        Workspace shell
      </button>
    );
  },
  WorkspaceProvider: ({
    children,
    host,
  }: {
    children?: ReactNode;
    host: WorkspaceHost;
  }) => {
    workspaceMocks.providerHosts.push(host);
    return <div data-testid="workspace-provider">{children}</div>;
  },
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;
let testLocalStorage: ReturnType<typeof createTestLocalStorage>;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

beforeEach(() => {
  testLocalStorage = createTestLocalStorage();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testLocalStorage,
  });
});

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  window.localStorage.removeItem(PYTHON_CANVAS_SHELL_PREFERENCE_KEY);
  if (originalLocalStorageDescriptor === undefined) {
    Reflect.deleteProperty(window, "localStorage");
  } else {
    Object.defineProperty(
      window,
      "localStorage",
      originalLocalStorageDescriptor,
    );
  }
  workspaceMocks.providerHosts.length = 0;
  workspaceMocks.shellProps.length = 0;
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

  it("mounts the package shell with controlled, stable host integrations", () => {
    const host = {} as WorkspaceHost;
    const view = renderView({ kind: "idle" }, null, null, {
      host,
      kind: "ready",
    });
    const initialShell = lastShellProps();
    const provider = view.querySelector("[data-testid='workspace-provider']");

    expect(initialShell.ariaLabel).toBe("Python Canvas workspace");
    expect(initialShell.leadingPaneShiftsCanvas).toBe(true);
    expect(initialShell.leadingTabs).toEqual([]);
    expect(initialShell.trailingTabs).toEqual([]);
    expect(initialShell.leadingTabs).toBe(initialShell.trailingTabs);
    expect(initialShell.viewState.leading.visible).toBe(true);
    expect(initialShell.viewState.trailing.visible).toBe(false);
    expect(workspaceMocks.providerHosts).toEqual([host]);
    expect(view.querySelector("[data-testid='workspace-canvas']")).toBeNull();

    const shell = view.querySelector("[data-testid='workspace-shell']");
    expect(shell).not.toBeNull();
    act(() => {
      shell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const updatedShell = lastShellProps();
    expect(updatedShell.viewState.trailing.visible).toBe(true);
    expect(updatedShell.leadingTabs).toBe(initialShell.leadingTabs);
    expect(updatedShell.trailingTabs).toBe(initialShell.trailingTabs);
    expect(workspaceMocks.providerHosts).toEqual([host, host]);
    expect(view.querySelector("[data-testid='workspace-provider']")).toBe(
      provider,
    );
    const persisted = testLocalStorage.getItem(
      PYTHON_CANVAS_SHELL_PREFERENCE_KEY,
    );
    expect(persisted).not.toBeNull();
    if (persisted === null) {
      throw new Error("The shell state was not persisted.");
    }
    expect(JSON.parse(persisted)).toEqual({
      version: PYTHON_CANVAS_SHELL_PREFERENCE_VERSION,
      viewState: updatedShell.viewState,
    });
  });

  it("does not mount a shell before the workspace is ready", () => {
    renderView({ kind: "idle" }, null, null, { kind: "loading" });

    expect(testLocalStorage.getItem).not.toHaveBeenCalled();
    expect(workspaceMocks.shellProps).toEqual([]);
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
  state:
    | { kind: "loading" }
    | { kind: "error" }
    | { host: WorkspaceHost; kind: "ready" } = {
    host: {} as WorkspaceHost,
    kind: "ready",
  },
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
        state={state}
        terminalContext={{
          ...terminalContext,
          state: { ...terminalContext.state, error: terminalError },
        }}
      />,
    );
  });
  return container;
}

function lastShellProps(): ShellPropsCapture {
  const props = workspaceMocks.shellProps.at(-1);
  if (props === undefined) {
    throw new Error("WorkspaceShell did not render.");
  }
  return props;
}

function createTestLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}
