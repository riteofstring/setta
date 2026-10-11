import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextValueCompletionProvider } from "@riteofstring/setta";

const editorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const itemListProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@riteofstring/setta", () => ({
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TextValueEditor: (props: Record<string, unknown>) => {
    editorProps.push(props);
    return (
      <input
        aria-label={String(props.ariaLabel)}
        disabled={Boolean(props.disabled)}
        readOnly
        value={String(props.value)}
      />
    );
  },
  WorkspaceItemList: (props: Record<string, unknown>) => {
    itemListProps.push(props);
    return <div data-testid="parameter-list" />;
  },
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
  itemListProps.length = 0;
});

describe("CallableSection", () => {
  it("leaves callable naming and deletion to the package-owned section header", () => {
    const view = render(
      <CallableSection
        data={sectionData({ state: "failed", status: "unavailable" })}
        parameters={[]}
        sectionId="python-canvas:callable:one"
      />,
    );

    expect(view.querySelector("form")).toBeNull();
    expect(view.querySelector("button")).toBeNull();
    expect(view.querySelector("label")).toBeNull();
    expect(view.querySelector("[role='alert']")).toBeNull();
  });

  it("renders the accepted compact callable field and delegates its interactions", () => {
    const completionProvider = vi.fn();
    const onCallableAlternateCommit = vi.fn();
    const onCallableCommit = vi.fn();
    const onCallableDraftChange = vi.fn();
    const onCallableRevert = vi.fn();
    render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
        sectionId="python-canvas:callable:one"
      />,
      {
        ...mutationContext(
          () => null,
          () => false,
          () => null,
          () => completionProvider,
        ),
        onCallableAlternateCommit,
        onCallableCommit,
        onCallableDraftChange,
        onCallableRevert,
      },
    );

    const field = editorProps[0];
    expect(field).toMatchObject({
      ariaLabel: "Callable expression",
      completionProvider,
      controlId: "callable-expression:callable:one",
      language: "python",
      presentation: "section-field",
      sectionId: "python-canvas:callable:one",
      singleLine: true,
      value: "value",
      wrapLines: false,
    });
    (field?.onValueChange as (value: string) => void)("draft");
    (field?.onCommit as (value: string) => void)("value");
    (field?.onAlternateCommit as (value: string) => void)("value");
    (field?.onEscape as () => void)();
    expect(onCallableDraftChange).toHaveBeenCalledWith("callable:one", "draft");
    expect(onCallableCommit).toHaveBeenCalledWith("callable:one", "value");
    expect(onCallableAlternateCommit).toHaveBeenCalledWith(
      "callable:one",
      "value",
    );
    expect(onCallableRevert).toHaveBeenCalledWith("callable:one");
  });

  it("shows main's apply hint after the draft settles and clears it on commit", () => {
    vi.useFakeTimers();
    try {
      const onCallableCommit = vi.fn();
      render(
        <CallableExpressionField
          data={sectionData({ state: "ready", status: "available" })}
          sectionId="python-canvas:callable:one"
        />,
        {
          ...mutationContext(),
          callableDraft: () => "draft",
          onCallableCommit,
        },
      );

      expect(editorProps.at(-1)?.uncommitted).toBe(false);
      act(() => vi.advanceTimersByTime(1_000));
      expect(editorProps.at(-1)?.uncommitted).toBe(true);

      act(() => {
        (editorProps.at(-1)?.onCommit as (value: string) => void)("draft");
      });
      expect(editorProps.at(-1)?.uncommitted).toBe(false);
      expect(onCallableCommit).toHaveBeenCalledWith("callable:one", "draft");
    } finally {
      vi.useRealTimers();
    }
  });

  it("projects Basedpyright diagnostics into the callable field and typed rows", () => {
    const parameter = authoredParameter("same");
    render(
      <>
        <CallableSection
          data={{
            ...sectionData({ state: "ready", status: "available" }),
            callableDiagnosticMessage: `"math" is not defined`,
            parameterDiagnostics: {
              "parameter:first": [
                { message: "A value is required.", severity: "error" },
              ],
            },
          }}
          parameters={[
            { data: parameter, id: "parameter:first" },
            { data: parameter, id: "parameter:second" },
          ]}
          sectionId="python-canvas:callable:one"
        />
        <CallableExpressionField
          data={{
            ...sectionData({ state: "ready", status: "available" }),
            callableDiagnosticMessage: `"math" is not defined`,
          }}
          sectionId="python-canvas:callable:one"
        />
      </>,
    );

    expect(editorProps.at(-1)).toMatchObject({
      diagnosticMessage: `"math" is not defined`,
      presentation: "section-field",
    });
    expect(itemListProps[0]).toMatchObject({
      topLevelItemIds: ["parameter:first", "parameter:second"],
      itemDiagnostics: {
        "parameter:first": [
          { message: "A value is required.", severity: "error" },
          {
            message: 'Param name "same" already exists under this parent.',
            severity: "error",
          },
        ],
        "parameter:second": [
          {
            message: 'Param name "same" already exists under this parent.',
            severity: "error",
          },
        ],
      },
    });
  });

  it("keeps section data closed and filters typed items by their label", () => {
    expect(() =>
      readCallableSectionData({
        ...sectionData({ state: "ready", status: "available" }),
        unexpected: true,
      }),
    ).toThrow("unexpected fields");
    expect(
      parameterItemSearchableText({
        children: [],
        id: "parameter:scale",
        presentation: {
          control: {
            kind: "code",
            value: "2",
            configuration: {
              autocomplete: "off",
              disabled: false,
              language: "python",
              placeholder: null,
              singleLine: true,
              wrapLines: true,
            },
          },
          label: "scale",
          labelEditable: true,
        },
      }),
    ).toBe("scale");
  });

  it("keeps mutation and completion failures out of the section layout", () => {
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(
        () => "Unable to save this callable. Try again.",
        () => false,
        () => "Unable to load callable completions. Try again.",
      ),
    );

    const alerts = Array.from(view.querySelectorAll("[role='alert']")).map(
      (element) => element.textContent,
    );
    expect(alerts).toEqual([
      "Unable to save this callable. Try again.",
      "Unable to load callable completions. Try again.",
    ]);
    expect(
      Array.from(view.querySelectorAll("[role='alert']")).every((element) =>
        element.classList.contains("python-canvas-announcer"),
      ),
    ).toBe(true);
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

function authoredParameter(name: string) {
  return {
    authoredExpression: "2",
    default: null,
    name,
    nameEditable: true,
    passingStyle: "positional_or_keyword" as const,
    providerOrdinal: null,
    typeAnnotation: null,
  };
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
    parameterMetadata: {},
    providerStatus: {
      provider: "basedpyright" as const,
      state,
      status,
    },
  };
}

function mutationContext(
  callableMutationError: (callableId: string) => string | null = () => null,
  parameterAuthoringPending: (callableId: string) => boolean = () => false,
  callableCompletionError: (callableId: string) => string | null = () => null,
  callableCompletionProvider: () =>
    TextValueCompletionProvider | undefined = () => undefined,
) {
  return {
    callableCompletionError,
    callableCompletionProvider,
    callableMutationError,
    callableDraft: () => "value",
    dictionaryMutationError: () => null,
    listMutationError: () => null,
    onCallableAlternateCommit: vi.fn(),
    onCallableCommit: vi.fn(),
    onCallableDraftChange: vi.fn(),
    onCallableRevert: vi.fn(),
    onParameterExpressionChange: vi.fn(),
    onParameterNameChange: vi.fn(),
    onDictionaryEntryExpressionChange: vi.fn(),
    onDictionaryEntryNameChange: vi.fn(),
    onListDecrement: vi.fn(),
    onListIncrement: vi.fn(),
    parameterAuthoringPending,
  };
}
