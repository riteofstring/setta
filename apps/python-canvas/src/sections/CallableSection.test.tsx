import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  type TextValueCompletionProvider,
} from "@setta/workspace";

const editorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const parameterRows = vi.hoisted(
  () => [] as Array<{ data: unknown; id: string }>,
);

vi.mock("@setta/workspace", () => ({
  ItemNameEditor: ({
    disabled,
    name,
  }: {
    disabled?: boolean;
    name: string;
  }) => (
    <input
      aria-label="Parameter name"
      disabled={Boolean(disabled)}
      value={name}
      readOnly
    />
  ),
  NO_DRAG_CLASS_NAME: "nodrag",
  NO_PAN_CLASS_NAME: "nopan",
  TextValueEditor: (props: Record<string, unknown>) => {
    editorProps.push(props);
    return (
      <input
        aria-label={String(props.ariaLabel)}
        disabled={Boolean(props.disabled)}
        value={String(props.value)}
        readOnly
      />
    );
  },
  WorkspaceItemLabel: ({
    children,
    className,
    title,
  }: {
    children?: ReactNode;
    className?: string;
    title?: string;
  }) => (
    <span className={className} title={title}>
      {children}
    </span>
  ),
  WorkspaceItemList: ({
    renderItem,
    sectionId,
    topLevelItemIds,
  }: {
    renderItem: (context: {
      item: { data: unknown; id: string };
      sectionId: string;
    }) => ReactNode;
    sectionId: string;
    topLevelItemIds: string[];
  }) => (
    <div data-testid="parameter-list">
      {topLevelItemIds.map((id) => {
        const item = parameterRows.find((row) => row.id === id);
        return item === undefined ? null : (
          <div key={id}>{renderItem({ item, sectionId })}</div>
        );
      })}
    </div>
  ),
}));

import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readCallableSectionData,
} from "./CallableSection";
import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  editorProps.length = 0;
  parameterRows.length = 0;
});

describe("CallableSection", () => {
  it("renders dynamic callable controls without duplicating provider status alerts", () => {
    const view = render(
      <CallableSection
        data={sectionData({ state: "failed", status: "unavailable" })}
        parameters={[]}
        sectionId="python-canvas:callable:one"
      />,
    );

    expect(view.querySelector("label")?.textContent).toBe("Callable name");
    expect(
      view.querySelector<HTMLInputElement>("input[name='callable-name']")
        ?.value,
    ).toBe("One callable");
    expect(view.querySelector("button[type='submit']")?.textContent).toBe(
      "Rename callable",
    );
    expect(
      view.querySelector("button[aria-label='Delete callable One callable']"),
    ).not.toBeNull();
    expect(view.querySelector("[role='alert']")).toBeNull();
  });

  it("renders an ID-keyed native expression input and independent commit action", () => {
    const onCallableCommit = vi.fn();
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
      />,
      { ...mutationContext(), onCallableCommit },
    );

    const input = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    expect(input?.id).toBe("python-canvas-callable-expression-callable%3Aone");
    expect(
      view.querySelector(
        "label[for='python-canvas-callable-expression-callable%3Aone']",
      )?.textContent,
    ).toBe("Callable expression");
    expect(input?.tagName).toBe("INPUT");
    expect(input?.form?.classList.contains(NO_DRAG_CLASS_NAME)).toBe(true);
    expect(input?.form?.classList.contains(NO_PAN_CLASS_NAME)).toBe(true);
    expect(input?.form?.getAttribute("data-tab-native")).toBe("true");
    expect(
      input?.form?.querySelector("button[type='submit']")?.textContent,
    ).toBe("Commit callable");
    act(() => {
      input?.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(onCallableCommit).toHaveBeenCalledWith("callable:one", "value");
  });

  it("keeps section and item data closed at the rendering boundary", () => {
    expect(() =>
      readCallableSectionData({
        ...sectionData({ state: "ready", status: "available" }),
        unexpected: true,
      }),
    ).toThrow("unexpected fields");
  });

  it("uses parameter names for public workspace filtering", () => {
    expect(
      parameterItemSearchableText({
        data: {
          authoredExpression: "2",
          default: null,
          name: "scale",
          nameEditable: true,
          passingStyle: "positional_or_keyword",
          providerOrdinal: null,
          typeAnnotation: null,
        },
      }),
    ).toBe("scale");
  });

  it("associates a mutation failure with both callable controls", () => {
    const view = render(
      <>
        <CallableExpressionField
          data={sectionData({ state: "ready", status: "available" })}
        />
        <CallableSection
          data={sectionData({ state: "ready", status: "available" })}
          parameters={[]}
          sectionId="python-canvas:callable:one"
        />
      </>,
      mutationContext(() => "Unable to save this callable. Try again."),
    );

    expect(
      view
        .querySelector<HTMLInputElement>("input[name='callable-name']")
        ?.getAttribute("aria-describedby"),
    ).toBe("python-canvas-callable-mutation-error-callable%3Aone");
    expect(
      view
        .querySelector<HTMLInputElement>("input[name='callable-expression']")
        ?.getAttribute("aria-describedby"),
    ).toBe("python-canvas-callable-mutation-error-callable%3Aone");
    expect(
      view
        .querySelector<HTMLInputElement>("input[name='callable-expression']")
        ?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      Array.from(view.querySelectorAll("p")).find(
        (element) =>
          element.id === "python-canvas-callable-mutation-error-callable%3Aone",
      )?.textContent,
    ).toBe("Unable to save this callable. Try again.");
  });

  it("associates a callable completion failure with the native expression input", () => {
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
      />,
      mutationContext(
        () => null,
        () => null,
        () => false,
        () => "Unable to load callable completions. Try again.",
      ),
    );

    const input = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe(
      "python-canvas-callable-completion-error-callable%3Aone",
    );
    expect(
      Array.from(view.querySelectorAll("p")).find(
        (element) =>
          element.id ===
          "python-canvas-callable-completion-error-callable%3Aone",
      )?.textContent,
    ).toBe("Unable to load callable completions. Try again.");
  });

  it("maps callable completions into the native expression list", async () => {
    const completionProvider = vi.fn().mockResolvedValue({
      from: 5,
      options: [{ insertText: "sqrt", label: "sqrt" }],
      to: 6,
    });
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
      />,
      mutationContext(
        () => null,
        () => null,
        () => false,
        () => null,
        () => completionProvider,
      ),
    );
    const input = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    if (input === null) {
      throw new Error("Expected the callable expression input.");
    }

    await act(async () => {
      setInputValue(input, "math.s");
      await Promise.resolve();
    });

    expect(completionProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorOffset: 6,
        explicit: false,
        value: "math.s",
      }),
    );
    expect(view.querySelector("datalist option")?.getAttribute("value")).toBe(
      "math.sqrt",
    );
  });

  it("requests native callable completion from the keyboard", async () => {
    const completionProvider = vi.fn().mockResolvedValue({
      from: 0,
      options: [{ insertText: "callable", label: "callable" }],
      to: 5,
    });
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
      />,
      mutationContext(
        () => null,
        () => null,
        () => false,
        () => null,
        () => completionProvider,
      ),
    );
    const input = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    if (input === null) {
      throw new Error("Expected the callable expression input.");
    }
    input.setSelectionRange(5, 5);

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: " ",
        }),
      );
      await Promise.resolve();
    });

    expect(completionProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        cursorOffset: 5,
        explicit: true,
        value: "value",
      }),
    );
    expect(view.querySelector("datalist option")?.getAttribute("value")).toBe(
      "callable",
    );
  });

  it("reverts on Escape and aborts stale callable completion requests", () => {
    const completionProvider = vi.fn().mockResolvedValue(null);
    const onCallableRevert = vi.fn();
    const workspaceEscapeHandler = vi.fn();
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
      />,
      {
        ...mutationContext(
          () => null,
          () => null,
          () => false,
          () => null,
          () => completionProvider,
        ),
        onCallableRevert,
      },
    );
    const input = view.querySelector<HTMLInputElement>(
      "input[name='callable-expression']",
    );
    if (input === null) {
      throw new Error("Expected the callable expression input.");
    }

    document.addEventListener("keydown", workspaceEscapeHandler);
    try {
      act(() => {
        setInputValue(input, "first");
        setInputValue(input, "second");
        input.focus();
        input.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
        );
      });
    } finally {
      document.removeEventListener("keydown", workspaceEscapeHandler);
    }

    const [firstRequest, secondRequest] = completionProvider.mock.calls.map(
      ([request]) => request as { signal: AbortSignal },
    );
    expect(firstRequest?.signal.aborted).toBe(true);
    expect(secondRequest?.signal.aborted).toBe(true);
    expect(onCallableRevert).toHaveBeenCalledWith("callable:one");
    expect(workspaceEscapeHandler).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it("renders immutable provider metadata, including an unannotated type", () => {
    const parameter = {
      authoredExpression: "value",
      default: null,
      name: "value",
      nameEditable: false,
      passingStyle: "positional_or_keyword" as const,
      providerOrdinal: 0,
      typeAnnotation: null,
    };
    parameterRows.push({ data: parameter, id: "parameter:value" });

    const view = render(
      <CallableSection
        data={sectionData({ state: "ready", status: "available" })}
        parameters={[{ data: parameter, id: "parameter:value" }]}
        sectionId="python-canvas:callable:one"
      />,
    );

    expect(
      view.querySelector(".python-canvas-parameter-name")?.textContent,
    ).toBe("value");
    expect(
      view.querySelector(".python-canvas-parameter-metadata")?.textContent,
    ).toBe(
      "Provider ordinal 0 · Passing style positional or keyword · Type unannotated",
    );
    expect(view.querySelector("input[aria-label='Parameter name']")).toBeNull();
  });

  it("makes parameter authoring unavailable while a callable mutation is pending", () => {
    const parameter = {
      authoredExpression: "later",
      default: null,
      name: "later",
      nameEditable: true,
      passingStyle: "positional_or_keyword" as const,
      providerOrdinal: null,
      typeAnnotation: null,
    };
    parameterRows.push({ data: parameter, id: "parameter:later" });

    const view = render(
      <CallableSection
        data={sectionData({ state: "ready", status: "available" })}
        parameters={[{ data: parameter, id: "parameter:later" }]}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(
        () => null,
        () => null,
        () => true,
      ),
    );

    expect(
      view.querySelector<HTMLInputElement>("input[aria-label='Parameter name']")
        ?.disabled,
    ).toBe(true);
    expect(
      view.querySelector<HTMLInputElement>(
        "input[aria-label='later expression']",
      )?.disabled,
    ).toBe(true);
    expect(
      view
        .querySelector(".python-canvas-callable-parameter-authoring")
        ?.hasAttribute("inert"),
    ).toBe(true);
  });

  it("keeps a callable rename draft when a conflict refresh changes its canonical name", () => {
    const view = render(
      <CallableSection
        data={{
          ...sectionData({ state: "ready", status: "available" }),
          callable: {
            authoredExpression: "value",
            id: "callable:one",
            name: "Remote callable name",
          },
        }}
        parameters={[]}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(
        () => null,
        () => "Local retry name",
      ),
    );

    expect(
      view.querySelector<HTMLInputElement>("input[name='callable-name']")
        ?.value,
    ).toBe("Local retry name");
  });

  it("scopes pending controls and inline errors to the affected callable", () => {
    const second = {
      ...sectionData({ state: "ready", status: "available" }),
      callable: {
        authoredExpression: "other",
        id: "callable:two",
        name: "Two callable",
      },
    };
    const view = render(
      <>
        <CallableSection
          data={sectionData({ state: "ready", status: "available" })}
          parameters={[]}
          sectionId="python-canvas:callable:one"
        />
        <CallableSection
          data={second}
          parameters={[]}
          sectionId="python-canvas:callable:two"
        />
      </>,
      mutationContext(
        (callableId) =>
          callableId === "callable:one"
            ? "Unable to save this callable."
            : null,
        () => null,
        (callableId) => callableId === "callable:one",
      ),
    );

    const names = view.querySelectorAll<HTMLInputElement>(
      "input[name='callable-name']",
    );
    expect(names).toHaveLength(2);
    expect(names[0]?.disabled).toBe(true);
    expect(names[1]?.disabled).toBe(false);
    expect(names[0]?.getAttribute("aria-describedby")).toBe(
      "python-canvas-callable-mutation-error-callable%3Aone",
    );
    expect(names[1]?.getAttribute("aria-describedby")).toBeNull();
    expect(view.textContent).toContain("Unable to save this callable.");
  });
});

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

function sectionData({
  state,
  status,
}: {
  state: "failed" | "ready";
  status: "available" | "unavailable";
}) {
  return {
    callable: {
      authoredExpression: "value",
      id: "callable:one",
      name: "One callable",
    },
    callableDiagnosticMessage: null,
    parameterDiagnostics: {},
    providerStatus: {
      provider: "basedpyright" as const,
      state,
      status,
    },
  };
}

function mutationContext(
  callableMutationError: (callableId: string) => string | null = () => null,
  callableNameDraft: (callableId: string) => string | null = () => null,
  callablePending: (callableId: string) => boolean = () => false,
  callableCompletionError: (callableId: string) => string | null = () => null,
  callableCompletionProvider: () =>
    TextValueCompletionProvider | undefined = () => undefined,
) {
  return {
    callableCompletionError,
    callableCompletionProvider,
    callableMutationError,
    callablePending,
    callableDraft: () => "value",
    callableNameDraft,
    onCallableCommit: vi.fn(),
    onCallableDelete: vi.fn(),
    onCallableDraftChange: vi.fn(),
    onCallableNameDraftChange: vi.fn(),
    onCallableRename: vi.fn(),
    onCallableRevert: vi.fn(),
    onParameterExpressionChange: vi.fn(),
    onParameterNameChange: vi.fn(),
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("The native input value setter is unavailable.");
  }
  setter.call(input, value);
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
