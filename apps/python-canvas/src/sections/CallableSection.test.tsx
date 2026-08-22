/* @vitest-environment jsdom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@setta/workspace", () => ({
  TextValueEditor: (props: Record<string, unknown>) => {
    mocks.editorProps.push(props);
    return <div data-editor={String(props.ariaLabel)} />;
  },
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  WorkspaceItemList: ({
    renderItem,
  }: {
    renderItem: (context: unknown) => ReactNode;
  }) =>
    renderItem({
      item: {
        data: {
          authoredExpression: "",
          default: null,
          disabled: false,
          kind: "parameter",
          name: "x",
          parameterId: "parameter:square-root:1",
          passingStyle: "positional_only",
          typeAnnotation: "",
        },
        id: "python-canvas:callable:parameter",
      },
      sectionId: "python-canvas:callable",
    }),
}));

import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import { CallableSection, type CallableSectionData } from "./CallableSection";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  mocks.editorProps.length = 0;
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = undefined;
  root = undefined;
});

describe("CallableSection", () => {
  it("attaches completions only to the callable editor and visibly separates completion errors", () => {
    const completionProvider = vi.fn();
    const error = "Unable to load callable completions. Try again.";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <PythonCanvasMutationContext.Provider
          value={{
            callableCompletionProvider: completionProvider,
            callableDraft: "math.sq",
            completionError: error,
            mutationError: null,
            onCallableCommit: vi.fn(),
            onCallableDraftChange: vi.fn(),
            onParameterExpressionChange: vi.fn(),
            pendingDescription: null,
          }}
        >
          <CallableSection data={callableData()} />
        </PythonCanvasMutationContext.Provider>,
      );
    });

    const callable = mocks.editorProps.find(
      (props) => props.ariaLabel === "Callable expression",
    );
    const parameter = mocks.editorProps.find(
      (props) => props.ariaLabel === "x expression",
    );
    expect(callable?.completionProvider).toBe(completionProvider);
    expect(parameter?.completionProvider).toBeUndefined();
    expect(container.querySelector("[role='alert']")?.textContent).toBe(error);
  });
});

function callableData(): CallableSectionData {
  return {
    callable: {
      authoredExpression: "",
      id: "callable:square-root",
      name: "Square Root",
    },
    hasParameter: true,
    parameterDiagnostics: [],
    providerStatus: {
      provider: "basedpyright",
      state: "ready",
      status: "available",
    },
  };
}
