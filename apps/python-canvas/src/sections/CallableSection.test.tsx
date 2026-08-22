import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextValueCompletionProvider } from "@setta/workspace";

const editorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const parameterRows = vi.hoisted(
  () => [] as Array<{ data: unknown; id: string }>,
);

vi.mock("@setta/workspace", () => ({
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
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
      act(() => vi.advanceTimersByTime(999));
      expect(editorProps.at(-1)?.uncommitted).toBe(false);
      act(() => vi.advanceTimersByTime(1));
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

  it("projects a Basedpyright callable diagnostic into the field presentation", () => {
    const data = sectionData({ state: "ready", status: "available" });
    render(
      <CallableExpressionField
        data={{ ...data, callableDiagnosticMessage: `"math" is not defined` }}
        sectionId="python-canvas:callable:one"
      />,
    );

    expect(editorProps[0]).toMatchObject({
      diagnosticMessage: `"math" is not defined`,
      presentation: "section-field",
    });
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

  it("keeps callable mutation failures out of the section layout", () => {
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(() => "Unable to save this callable. Try again."),
    );

    const alert = view.querySelector("[role='alert']");
    expect(alert?.textContent).toBe("Unable to save this callable. Try again.");
    expect(alert?.classList.contains("python-canvas-announcer")).toBe(true);
    expect(editorProps[0]?.diagnosticMessage).toBeUndefined();
  });

  it("keeps completion failures out of the section layout", () => {
    const view = render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(
        () => null,
        () => false,
        () => "Unable to load callable completions. Try again.",
      ),
    );

    const alert = view.querySelector("[role='alert']");
    expect(alert?.textContent).toBe(
      "Unable to load callable completions. Try again.",
    );
    expect(alert?.classList.contains("python-canvas-announcer")).toBe(true);
    expect(editorProps[0]?.diagnosticMessage).toBeUndefined();
  });

  it("renders a provider parameter as main's name-only row", () => {
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

    const label = view.querySelector(".python-canvas-parameter-label");
    expect(label?.textContent).toBe("value");
    expect(label?.getAttribute("title")).toBeNull();
    expect(view.textContent).not.toContain("Provider ordinal");
    expect(view.textContent).not.toContain("Passing style");
    expect(view.textContent).not.toContain("unannotated");
    expect(editorProps[0]?.placeholder).toBeUndefined();
    expect(view.querySelector("input[aria-label='Parameter name']")).toBeNull();
  });

  it("makes parameter authoring unavailable only during a callable expression operation", () => {
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
    expect(
      view.querySelector("[data-python-canvas-parameter-pending='true']"),
    ).not.toBeNull();
    expect(
      view
        .querySelector(".python-canvas-callable-section")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });

  it("keeps callable fields enabled while pending state stays scoped", () => {
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
        <CallableExpressionField
          data={sectionData({ state: "ready", status: "available" })}
          sectionId="python-canvas:callable:one"
        />
        <CallableExpressionField
          data={second}
          sectionId="python-canvas:callable:two"
        />
      </>,
      mutationContext(
        (callableId) =>
          callableId === "callable:one"
            ? "Unable to save this callable."
            : null,
        (callableId) => callableId === "callable:one",
      ),
    );

    expect(editorProps).toHaveLength(2);
    expect(editorProps[0]?.disabled).toBeUndefined();
    expect(editorProps[1]?.disabled).toBeUndefined();
    const alert = view.querySelector("[role='alert']");
    expect(alert?.textContent).toBe("Unable to save this callable.");
    expect(alert?.classList.contains("python-canvas-announcer")).toBe(true);
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
    onCallableAlternateCommit: vi.fn(),
    onCallableCommit: vi.fn(),
    onCallableDraftChange: vi.fn(),
    onCallableRevert: vi.fn(),
    onParameterExpressionChange: vi.fn(),
    onParameterNameChange: vi.fn(),
    parameterAuthoringPending,
  };
}
