import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const editorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@setta/workspace", () => ({
  ItemNameEditor: ({ name }: { name: string }) => (
    <input aria-label="Parameter name" value={name} readOnly />
  ),
  TextValueEditor: (props: Record<string, unknown>) => {
    editorProps.push(props);
    return (
      <input
        aria-label={String(props.ariaLabel)}
        value={String(props.value)}
        readOnly
      />
    );
  },
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  WorkspaceItemList: () => <div data-testid="parameter-list" />,
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
});

describe("CallableSection", () => {
  it("renders dynamic callable controls with labels and a provider failure", () => {
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
    expect(view.querySelector("[role='alert']")?.textContent).toContain(
      "Basedpyright is unavailable",
    );
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
        },
      }),
    ).toBe("scale");
  });
});

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasMutationContext.Provider value={mutationContext()}>
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

function mutationContext() {
  return {
    callableCompletionError: () => null,
    callableCompletionProvider: () => undefined,
    callableDraft: () => "value",
    mutationError: null,
    onCallableCommit: vi.fn(),
    onCallableDelete: vi.fn(),
    onCallableDraftChange: vi.fn(),
    onCallableRename: vi.fn(),
    onCallableRevert: vi.fn(),
    onParameterExpressionChange: vi.fn(),
    onParameterNameChange: vi.fn(),
    pending: false,
  };
}
