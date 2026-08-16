/* @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<Record<string, unknown>>,
  // The row the mocked item list renders. Every `render` call sets it.
  parameterItem: { data: undefined as unknown, id: "" },
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
  // The leaf element this app styles, without the package's own wrapper around it. These cases
  // therefore judge what the app renders into the label, not how the package's item column lays it
  // out, so the stylesheet's truncating single line is not proved here.
  WorkspaceItemLabel: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <p className={className}>{children}</p>,
  WorkspaceItemList: ({
    renderItem,
  }: {
    renderItem: (context: unknown) => ReactNode;
  }) =>
    renderItem({
      item: mocks.parameterItem,
      sectionId: "python-canvas:callable",
    }),
}));

import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readParameterItemData,
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

  // Main's callable search gives Enter to the commit and Escape to abandoning the draft. The field
  // declares both seams; the package owns which key reaches which one.
  it("commits the field's draft and abandons it back to the canonical expression", () => {
    const onCallableCommit = vi.fn();
    const onCallableRevert = vi.fn();
    render({ onCallableCommit, onCallableRevert });

    const callable = renderedEditor("Callable expression");
    expect(callable.onCommit).toBe(onCallableCommit);
    expect(callable.onEscape).toBe(onCallableRevert);
    // Only the callable holds a draft of its own; a parameter row reports every change.
    expect(renderedEditor("x expression").onEscape).toBeUndefined();
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

  it("projects the row's own visible name as the filter's searchable text", () => {
    expect(parameterItemSearchableText(parameterItem())).toBe("x");
    expect(parameterItemSearchableText(parameterItemWithDefault())).toBe(
      "tolerance",
    );
    expect(parameterItemSearchableText({ data: { kind: "empty" } })).toBe("");
  });

  it("renders main's ordinary text parameter rather than analyzer metadata", () => {
    render();

    // Main's row shows the display name and nothing else. The rejected candidate printed the
    // passing style and the provider's own type spelling underneath it.
    const label = container?.querySelector(".python-canvas-parameter-label");
    expect(label?.textContent).toBe("x");
    // The analyzer's vocabulary cannot reach the row at all: the row payload's own reader rejects
    // the two fields the rejected candidate printed, so a projection carrying them fails loud
    // instead of quietly rendering them again.
    for (const analyzerField of [
      { passingStyle: "positional only" },
      { typeAnnotation: "_SupportsFloatOrIndex" },
    ]) {
      expect(() =>
        readParameterItemData({
          ...(parameterItem().data as Record<string, unknown>),
          ...analyzerField,
        }),
      ).toThrow("Callable section data contains unexpected fields.");
    }
    // `math.sqrt`'s parameter has no default, so its empty value editor offers no invented
    // placeholder, and neither does the callable field above it.
    expect(renderedEditor("x expression").placeholder).toBeUndefined();
    expect(renderedEditor("Callable expression").placeholder).toBeUndefined();
  });

  it("offers a real default as the value editor's placeholder", () => {
    render({}, callableData(), parameterItemWithDefault());

    expect(renderedEditor("tolerance expression").placeholder).toBe("1.0");
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
  item: { data: unknown; id: string } = parameterItem(),
) {
  mocks.parameterItem = item;
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
          onCallableRevert: vi.fn(),
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

// The real `math.sqrt` parameter: a positional `x` with no default.
function parameterItem(): { data: unknown; id: string } {
  return {
    data: {
      authoredExpression: "",
      default: null,
      disabled: false,
      kind: "parameter",
      name: "x",
      parameterId: "parameter:square-root:1",
    },
    id: "python-canvas:callable:parameter",
  };
}

function parameterItemWithDefault(): { data: unknown; id: string } {
  return {
    data: {
      authoredExpression: "",
      default: "1.0",
      disabled: false,
      kind: "parameter",
      name: "tolerance",
      parameterId: "parameter:square-root:2",
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
