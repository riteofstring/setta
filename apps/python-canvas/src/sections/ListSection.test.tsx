import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import type { PythonCanvasMutationContextValue } from "../app/PythonCanvasMutationContext";
import { ListSection, readListSectionData } from "./ListSection";

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

describe("ListSection", () => {
  it("uses native labeled controls and delegates the positive action count", () => {
    const onListDecrement = vi.fn();
    const onListIncrement = vi.fn();
    const view = render(<ListSection data={listData({ childCount: 3 })} />, {
      ...mutationContext(),
      onListDecrement,
      onListIncrement,
    });

    const input = requiredInput(view);
    const remove = requiredButton(view, "Remove children");
    const add = requiredButton(view, "Add children");
    expect(input.getAttribute("aria-label")).toBe("Child count");
    expect(input.type).toBe("text");
    expect(input.value).toBe("1");
    expect(remove.disabled).toBe(false);
    expect(add.disabled).toBe(false);
    expect(view.querySelector(".section-row-main svg path")).not.toBeNull();
    expect(remove.classList.contains("gg-math-minus")).toBe(true);
    expect(add.classList.contains("gg-math-plus")).toBe(true);
    expect(remove.textContent).toBe("");
    expect(add.textContent).toBe("");
    expect(remove.dataset.settaWorkspaceTouchTarget).toBe("compact");
    expect(add.dataset.settaWorkspaceTouchTarget).toBe("compact");

    act(() => {
      setInputValue(input, "2");
    });
    act(() => {
      remove.click();
      add.click();
    });
    expect(onListDecrement).toHaveBeenCalledWith("list:objects", 2);
    expect(onListIncrement).toHaveBeenCalledWith("list:objects", 2);
  });

  it("resets a blank or zero count to one on blur", () => {
    const view = render(<ListSection data={listData({ childCount: 1 })} />);
    const input = requiredInput(view);

    act(() => {
      setInputValue(input, "");
      input.focus();
      input.blur();
    });
    expect(input.value).toBe("1");

    act(() => {
      setInputValue(input, "0");
      input.focus();
      input.blur();
    });
    expect(input.value).toBe("1");
  });

  it("keeps canonical actions available like main and keeps errors out of the shell", () => {
    const empty = render(<ListSection data={listData({ childCount: 0 })} />);
    expect(requiredButton(empty, "Remove children").disabled).toBe(false);
    expect(requiredButton(empty, "Add children").disabled).toBe(false);

    act(() => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;

    const pending = render(
      <ListSection data={listData({ childCount: 0, pending: true })} />,
      {
        ...mutationContext(),
        listMutationError: () =>
          "Unable to update the list children. Try again.",
      },
    );
    expect(requiredButton(pending, "Remove children").disabled).toBe(true);
    expect(requiredButton(pending, "Add children").disabled).toBe(true);
    const alert = pending.querySelector("[role='alert']");
    expect(alert?.classList.contains("python-canvas-announcer")).toBe(true);
    expect(alert?.textContent).toBe(
      "Unable to update the list children. Try again.",
    );
  });

  it("keeps list data closed at the rendering boundary", () => {
    expect(() =>
      readListSectionData({
        childCount: 0,
        list: { id: "list:objects", name: "Objects" },
        pending: false,
        unexpected: true,
      }),
    ).toThrow("unexpected fields");
  });
});

function listData({
  childCount,
  pending = false,
}: {
  childCount: number;
  pending?: boolean;
}) {
  return {
    childCount,
    list: { id: "list:objects", name: "Objects" },
    pending,
  };
}

function render(node: ReactNode, context = mutationContext()): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasMutationContext.Provider value={context}>
        {node}
      </PythonCanvasMutationContext.Provider>,
    );
  });
  return container;
}

function requiredInput(view: HTMLDivElement): HTMLInputElement {
  const input = view.querySelector<HTMLInputElement>("input[name='children']");
  if (input === null) {
    throw new Error("Expected the List of Objects child-count input.");
  }
  return input;
}

function requiredButton(
  view: HTMLDivElement,
  label: string,
): HTMLButtonElement {
  const button = view.querySelector<HTMLButtonElement>(
    `button[aria-label='${label}']`,
  );
  if (button === null) {
    throw new Error(`Expected the ${label} button.`);
  }
  return button;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function mutationContext(): PythonCanvasMutationContextValue {
  return {
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
}
