/* @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<Record<string, unknown>>,
  nameEditorProps: [] as Array<Record<string, unknown>>,
  // The rows the mocked item list renders, in order. Every `render` call sets them.
  parameterItems: [] as Array<{ data: unknown; id: string }>,
}));

vi.mock("@setta/workspace", () => ({
  // The package's own name editor, which an app-authored parameter renames through.
  ItemNameEditor: (props: Record<string, unknown>) => {
    mocks.nameEditorProps.push(props);
    return <div data-name-editor={String(props.itemId)} />;
  },
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
  }) => (
    <>
      {mocks.parameterItems.map((item) => (
        <div data-parameter-row={item.id} key={item.id}>
          {renderItem({ item, sectionId: "python-canvas:callable" })}
        </div>
      ))}
    </>
  ),
}));

import { PythonCanvasMutationContext } from "../app/PythonCanvasMutationContext";
import {
  CallableExpressionField,
  CallableSection,
  parameterItemSearchableText,
  readParameterItemData,
  type CallableSectionData,
  type ParameterItemData,
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
  mocks.nameEditorProps.length = 0;
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
    expect(parameter.controlId).toBe("parameter:square-root:provider");
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

  it("keeps project pending state out of the callable field's presentation", () => {
    render({ pending: true });

    const callable = renderedEditor("Callable expression");
    expect(callable.disabled).toBe(true);
    expect(callable.endAdornment).toBeUndefined();
    expect(container?.querySelector("[role='status']")).toBeNull();
    expect(container?.querySelector("[role='alert']")).toBeNull();
    expect(appStyles).not.toContain("python-canvas-pending-mark");
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
    // A row nobody has named yet matches nothing, which is what it shows.
    expect(parameterItemSearchableText(authoredParameterItem(""))).toBe("");
  });

  it("renames an app-authored parameter through the package's own name editor", () => {
    const onParameterNameChange = vi.fn();
    render({ onParameterNameChange }, callableData(), [
      authoredParameterItem(""),
    ]);

    // A provider-derived row keeps main's static label; an authored one gets the editor.
    expect(
      container?.querySelector(".python-canvas-parameter-label"),
    ).toBeNull();
    const nameEditor = mocks.nameEditorProps[0];
    expect(nameEditor?.itemId).toBe("parameter:authored:1");
    expect(nameEditor?.name).toBe("");
    expect(nameEditor?.language).toBe("python");
    (nameEditor?.onNameChange as (name: string) => void)("scale");
    expect(onParameterNameChange).toHaveBeenCalledWith(
      "parameter:authored:1",
      "scale",
    );
    // Until it has a name, its value editor still needs an accessible one.
    expect(renderedEditor("Unnamed parameter expression").controlId).toBe(
      "parameter:authored:1",
    );
  });

  it("keeps a provider-derived name out of the app's reach", () => {
    render({}, callableData(), [parameterItem()]);

    expect(mocks.nameEditorProps).toEqual([]);
    expect(
      container?.querySelector(".python-canvas-parameter-label")?.textContent,
    ).toBe("x");
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
    render({}, callableData(), [parameterItemWithDefault()]);

    expect(renderedEditor("tolerance expression").placeholder).toBe("1.0");
  });

  // Main answers an unusable name beside the row it was typed in and keeps the text there. The
  // rejected candidate sent it, and the store's refusal restored the whole list over what someone
  // was still writing.
  it("reports an unusable authored name on its own row without taking it back", () => {
    render({}, callableData(), [authoredParameterItem("2x")]);

    const nameEditor = renderedNameEditor("parameter:authored:1");
    expect(nameEditor.errorMessage).toBe(
      "Param name must be a valid Python identifier.",
    );
    // The row still shows what is being typed: nothing restored it to the canonical name.
    expect(nameEditor.name).toBe("2x");
    // This is the row's own problem, not a failure of the section's mutation.
    expect(container?.querySelector("[role='alert']")).toBeNull();
  });

  it("reports a name another record already claims on the row that can change it", () => {
    render({}, callableData(), [
      parameterItem(),
      authoredParameterItem("x", "parameter:authored:collides"),
      authoredParameterItem("scale", "parameter:authored:scale"),
    ]);

    // The signature-derived `x` row has no editor to report on, so the authored row that
    // duplicates it carries the message.
    expect(renderedNameEditor("parameter:authored:collides").errorMessage).toBe(
      'Param name "x" already exists under this parent.',
    );
    expect(renderedNameEditor("parameter:authored:scale").errorMessage).toBe(
      "",
    );
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
  items: Array<ParameterItemRowFixture> = [parameterItem()],
) {
  mocks.parameterItems = items;
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
          onParameterNameChange: vi.fn(),
          pending: false,
          ...overrides,
        }}
      >
        <CallableExpressionField />
        <CallableSection data={data} parameters={items} />
      </PythonCanvasMutationContext.Provider>,
    );
  });
}

function renderedNameEditor(itemId: string): Record<string, unknown> {
  const props = mocks.nameEditorProps.find(
    (candidate) => candidate.itemId === itemId,
  );
  if (props === undefined) {
    throw new Error(`No name editor renders for the row ${itemId}.`);
  }
  return props;
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

// The real `math.sqrt` parameter: a positional `x` with no default, whose name belongs to the
// resolved signature.
type ParameterItemRowFixture = { data: ParameterItemData; id: string };

function parameterItem(): ParameterItemRowFixture {
  return {
    data: {
      authoredExpression: "",
      default: null,
      disabled: false,
      name: "x",
      nameEditable: false,
    },
    id: "parameter:square-root:provider",
  };
}

function parameterItemWithDefault(): ParameterItemRowFixture {
  return {
    data: {
      authoredExpression: "",
      default: "1.0",
      disabled: false,
      name: "tolerance",
      nameEditable: false,
    },
    id: "parameter:square-root:2",
  };
}

// One app-authored record, which the store lets stay blank while someone writes it.
function authoredParameterItem(
  name: string,
  id = "parameter:authored:1",
): ParameterItemRowFixture {
  return {
    data: {
      authoredExpression: "",
      default: null,
      disabled: false,
      name,
      nameEditable: true,
    },
    id,
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
    parameterDiagnostics: {},
    providerStatus,
  };
}
