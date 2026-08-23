import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupTerminal: vi.fn(),
  mountGeneratedPythonTerminal: vi.fn(),
}));

vi.mock("@setta/workspace", () => ({
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
}));

vi.mock("./generatedPythonTerminalClient", () => ({
  mountGeneratedPythonTerminal: mocks.mountGeneratedPythonTerminal,
}));

import {
  GeneratedPythonTerminalHeaderControls,
  GeneratedPythonTerminalSection,
} from "./GeneratedPythonTerminal";
import {
  GeneratedPythonTerminalContext,
  type GeneratedPythonTerminalContextValue,
} from "./generatedPythonTerminalContext";
import type { GeneratedPythonTerminalState } from "./generatedPythonTerminalController";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mountGeneratedPythonTerminal.mockReturnValue(mocks.cleanupTerminal);
});

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
});

describe("GeneratedPythonTerminal", () => {
  it("uses the exact local header labels and keeps Create separate from Run", () => {
    const actions = createActions();
    const view = renderTerminal(
      <GeneratedPythonTerminalHeaderControls />,
      terminalContext({ status: "absent" }, actions),
    );

    const run = requiredButton(view, "Run this code block");
    const create = requiredButton(view, "Create terminal");
    expect(run.disabled).toBe(false);
    expect(run.classList.contains("nodrag")).toBe(true);
    expect(create.classList.contains("nodrag")).toBe(true);
    expect(create.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      create.click();
    });
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.run).not.toHaveBeenCalled();

    act(() => {
      run.click();
    });
    expect(actions.run).toHaveBeenCalledTimes(1);

    renderIntoRoot(
      <GeneratedPythonTerminalHeaderControls />,
      terminalContext({ status: "hidden" }, actions),
    );
    const show = requiredButton(view, "Show terminal");
    act(() => {
      show.click();
    });
    expect(actions.show).toHaveBeenCalledTimes(1);

    renderIntoRoot(
      <GeneratedPythonTerminalHeaderControls />,
      terminalContext({ status: "visible" }, actions),
    );
    const hide = requiredButton(view, "Hide terminal");
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    act(() => {
      hide.click();
    });
    expect(actions.hide).toHaveBeenCalledTimes(1);
  });

  it("joins the visible terminal below the editor and preserves its session on hide/show", () => {
    const actions = createActions();
    const visible = terminalContext(
      {
        projectId: "project:terminal",
        sessionKey: "project:terminal:generated-python:1",
        status: "visible",
      },
      actions,
    );
    const view = renderTerminal(
      <GeneratedPythonTerminalSection editor={<div data-testid="editor" />} />,
      visible,
    );

    const pane = view.querySelector<HTMLDivElement>(
      ".python-canvas-generated-python-terminal-pane",
    );
    expect(pane?.style.flexBasis).toBe("220px");
    expect(view.querySelector("[data-testid='editor']")).not.toBeNull();
    expect(mocks.mountGeneratedPythonTerminal).toHaveBeenCalledWith({
      container: expect.any(HTMLDivElement),
      onError: actions.reportStreamError,
      projectId: "project:terminal",
      sessionKey: "project:terminal:generated-python:1",
    });

    const splitter = view.querySelector<HTMLDivElement>(
      "[role='separator'][aria-label='Resize terminal height']",
    );
    if (splitter === null) {
      throw new Error("Expected the terminal splitter.");
    }
    act(() => {
      splitter.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    expect(actions.resize).toHaveBeenCalledWith(230);

    const trash = requiredButton(view, "Trash terminal");
    expect(trash.classList.contains("nodrag")).toBe(true);
    expect(trash.classList.contains("nopan")).toBe(true);
    act(() => {
      trash.click();
    });
    expect(actions.close).toHaveBeenCalledTimes(1);

    renderIntoRoot(
      <GeneratedPythonTerminalSection editor={<div data-testid="editor" />} />,
      terminalContext({ status: "hidden" }, actions),
    );
    expect(view.querySelector("[data-attached-terminal-section-id]")).toBeNull();
    expect(mocks.cleanupTerminal).toHaveBeenCalledTimes(1);

    renderIntoRoot(
      <GeneratedPythonTerminalSection editor={<div data-testid="editor" />} />,
      visible,
    );
    expect(mocks.mountGeneratedPythonTerminal).toHaveBeenCalledTimes(2);
    expect(mocks.mountGeneratedPythonTerminal).toHaveBeenLastCalledWith({
      container: expect.any(HTMLDivElement),
      onError: actions.reportStreamError,
      projectId: "project:terminal",
      sessionKey: "project:terminal:generated-python:1",
    });
  });
});

function createActions(): GeneratedPythonTerminalContextValue["actions"] {
  return {
    close: vi.fn(),
    create: vi.fn(),
    hide: vi.fn(),
    reportStreamError: vi.fn(),
    resize: vi.fn(),
    run: vi.fn(),
    show: vi.fn(),
  };
}

function terminalContext(
  changes: Partial<GeneratedPythonTerminalState>,
  actions: GeneratedPythonTerminalContextValue["actions"],
): GeneratedPythonTerminalContextValue {
  return {
    actions,
    state: {
      creating: false,
      error: null,
      projectId: null,
      sessionKey: null,
      status: "absent",
      terminalHeight: 220,
      ...changes,
    },
  };
}

function renderTerminal(
  content: ReactNode,
  context: GeneratedPythonTerminalContextValue,
): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  renderIntoRoot(content, context);
  return container;
}

function renderIntoRoot(
  content: ReactNode,
  context: GeneratedPythonTerminalContextValue,
): void {
  act(() => {
    root?.render(
      <GeneratedPythonTerminalContext.Provider value={context}>
        {content}
      </GeneratedPythonTerminalContext.Provider>,
    );
  });
}

function requiredButton(view: HTMLDivElement, label: string): HTMLButtonElement {
  const button = view.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (button === null) {
    throw new Error(`Expected the ${label} button.`);
  }
  return button;
}
