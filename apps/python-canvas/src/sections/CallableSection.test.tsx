import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const editorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const parameterRows = vi.hoisted(
  () => [] as Array<{ data: unknown; id: string }>,
);

vi.mock("@setta/workspace", () => ({
  ItemNameEditor: ({ name }: { name: string }) => (
    <input aria-label="Parameter name" value={name} readOnly />
  ),
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

  it("uses the callable ID to isolate expression editors", () => {
    render(
      <CallableExpressionField
        data={sectionData({ state: "ready", status: "available" })}
        sectionId="python-canvas:callable:one"
      />,
    );

    expect(editorProps).toEqual([
      expect.objectContaining({
        ariaLabel: "Callable expression for One callable",
        controlId: "callable-expression:callable:one",
        sectionId: "python-canvas:callable:one",
        value: "value",
      }),
    ]);
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
          disabled: false,
          name: "scale",
          nameEditable: true,
          passingStyle: "positional_or_keyword",
          providerOrdinal: null,
          typeAnnotation: null,
        },
      }),
    ).toBe("scale");
  });

  it("associates a mutation failure with the callable name control", () => {
    const view = render(
      <CallableSection
        data={sectionData({ state: "ready", status: "available" })}
        parameters={[]}
        sectionId="python-canvas:callable:one"
      />,
      mutationContext(() => "Unable to save this callable. Try again."),
    );

    expect(
      view
        .querySelector<HTMLInputElement>("input[name='callable-name']")
        ?.getAttribute("aria-describedby"),
    ).toBe("python-canvas-callable-mutation-error-callable%3Aone");
    expect(
      Array.from(view.querySelectorAll("p")).find(
        (element) =>
          element.id === "python-canvas-callable-mutation-error-callable%3Aone",
      )?.textContent,
    ).toBe("Unable to save this callable. Try again.");
  });

  it("renders immutable provider metadata, including an unannotated type", () => {
    const parameter = {
      authoredExpression: "value",
      default: null,
      disabled: false,
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
) {
  return {
    callableCompletionError: () => null,
    callableCompletionProvider: () => undefined,
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
