/* @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@setta/workspace", () => ({
  TextValueEditor: (props: Record<string, unknown>) => {
    mocks.editorProps.push(props);
    return (
      <div data-editor={String(props.ariaLabel)}>
        {props.endAdornment as ReactNode}
      </div>
    );
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
      item: parameterItem(),
      sectionId: "python-canvas:callable",
    }),
}));

import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  type CallableSectionData,
} from "./CallableSection";

// Vite rewrites `new URL(..., import.meta.url)` into an asset URL, so resolve this suite's own
// location first and read the app stylesheet from the filesystem.
const appStyles = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../index.css"),
  "utf8",
);

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
  it("renders the callable editor as a compact section field with callable-only completion", () => {
    const completionProvider = vi.fn();
    render({ callableCompletionProvider: completionProvider });

    const callable = renderedEditor("Callable expression");
    const parameter = renderedEditor("x expression");
    expect(callable.presentation).toBe("section-field");
    expect(callable.controlId).toBe("callable-expression");
    expect(callable.singleLine).toBe(true);
    expect(callable.completionProvider).toBe(completionProvider);
    // Parameter rows keep the package's item-row control and take no completions.
    expect(parameter.presentation).toBe("item-row");
    expect(parameter.controlId).toBe("python-canvas:callable:parameter");
    expect(parameter.completionProvider).toBeUndefined();
    // No redundant visible label, and no idle sentence about the provider.
    expect(container?.textContent).not.toContain("Basedpyright");
    expect(container?.querySelector("[role='alert']")).toBeNull();
  });

  it("shows ordinary pending state as a compact adornment plus an app-owned live region", () => {
    render({ pendingDescription: "Checking the callable with Basedpyright." });

    const callable = renderedEditor("Callable expression");
    expect(callable.disabled).toBe(true);
    const adornment = container?.querySelector(".python-canvas-pending-mark");
    expect(adornment?.getAttribute("aria-hidden")).toBe("true");
    expect(adornment?.textContent).toBe("");
    const status = container?.querySelector("[role='status']");
    expect(status?.textContent).toBe(
      "Checking the callable with Basedpyright.",
    );
    expect(status?.className).toBe("python-canvas-visually-hidden");
    expect(container?.querySelector("[role='alert']")).toBeNull();
  });

  it("keeps the ordinary pending cue visible once forced colours repaint it", () => {
    expect(appStyles).toMatch(
      /@media \(forced-colors: active\)[^}]*\.python-canvas-pending-mark[^}]*background: CanvasText/su,
    );
  });

  it("gives every app-owned colour both appearances", () => {
    // The view follows the reader's system appearance, so a single-appearance colour here would
    // frame the package's dark canvas in light page chrome.
    expect(appStyles).toMatch(/^\s*color-scheme: light dark;$/mu);
    const singleAppearanceColours = appStyles
      .split("\n")
      .filter(
        (line) =>
          /#[\da-f]{3,8}\b/iu.test(line) && !line.includes("light-dark("),
      );
    expect(singleAppearanceColours).toEqual([]);
  });

  it("paints no app focus outline inside a package-owned surface", () => {
    // A descendant focus rule here reaches into the package's editors, which is how the rejected
    // candidate drew a browser outline inside generated Python.
    expect(appStyles).not.toMatch(/\.python-canvas-[\w-]+\s+[^,{]*:focus/u);
  });

  it("keeps mutation and completion failures distinct, visible, and accessible", () => {
    render({
      completionError: "Unable to load callable completions. Try again.",
      mutationError: "Unable to update callable. Try again.",
    });

    const alerts = [...(container?.querySelectorAll("[role='alert']") ?? [])];
    expect(alerts.map((alert) => alert.className)).toEqual([
      "python-canvas-mutation-error",
      "python-canvas-completion-error",
    ]);
    expect(alerts[0]?.textContent).toBe(
      "Unable to update callable. Try again.",
    );
    expect(alerts[1]?.textContent).toBe(
      "Unable to load callable completions. Try again.",
    );
  });

  it("still surfaces a genuine provider failure in the section body", () => {
    render(
      {},
      callableData({
        provider: "basedpyright",
        state: "failed",
        status: "unavailable",
      }),
    );

    expect(
      container?.querySelector(".python-canvas-provider-error")?.textContent,
    ).toBe(
      "Basedpyright is unavailable. Try the change again when it is ready.",
    );
  });

  it("projects the row's own name and metadata as the filter's searchable text", () => {
    expect(parameterItemSearchableText(parameterItem())).toBe(
      "x positional only",
    );
    expect(
      parameterItemSearchableText({
        data: {
          authoredExpression: "3",
          default: "1.0",
          disabled: false,
          kind: "parameter",
          name: "tolerance",
          parameterId: "parameter:square-root:2",
          passingStyle: "keyword_only",
          typeAnnotation: "float",
        },
      }),
    ).toBe("tolerance keyword only · float · default 1.0");
    expect(parameterItemSearchableText({ data: { kind: "empty" } })).toBe("");
  });
});

// These two app-owned renderers mount as siblings only to exercise them together. In production
// the package places the field inside its item-filter provider ahead of the toolbar and list;
// that order is proved package-side in SectionContainer's item-area cases.
function render(
  overrides: Partial<
    React.ComponentProps<typeof PythonCanvasMutationContext.Provider>["value"]
  > = {},
  data: CallableSectionData = callableData(),
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <PythonCanvasMutationContext.Provider
        value={{
          callableCompletionProvider: undefined,
          callableDraft: "math.sq",
          completionError: null,
          mutationError: null,
          onCallableCommit: vi.fn(),
          onCallableDraftChange: vi.fn(),
          onParameterExpressionChange: vi.fn(),
          pendingDescription: null,
          ...overrides,
        }}
      >
        <CallableExpressionField />
        <CallableSection data={data} />
      </PythonCanvasMutationContext.Provider>,
    );
  });
}

function renderedEditor(ariaLabel: string): Record<string, unknown> {
  const props = mocks.editorProps.find(
    (candidate) => candidate.ariaLabel === ariaLabel,
  );
  if (props === undefined) {
    throw new Error(`No editor renders with the accessible name ${ariaLabel}.`);
  }
  return props;
}

function parameterItem(): { data: unknown; id: string } {
  return {
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
  };
}

function callableData(
  providerStatus: CallableSectionData["providerStatus"] = {
    provider: "basedpyright",
    state: "ready",
    status: "available",
  },
): CallableSectionData {
  return {
    callable: {
      authoredExpression: "",
      id: "callable:square-root",
      name: "Square Root",
    },
    hasParameter: true,
    parameterDiagnostics: [],
    providerStatus,
  };
}
