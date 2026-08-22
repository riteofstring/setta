import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const dictionaryRows = vi.hoisted(
  () =>
    [] as Array<{
      children: string[];
      data: Record<string, string>;
      id: string;
    }>,
);
const itemListProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const nameEditorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const valueEditorProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@setta/workspace", () => ({
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ItemNameEditor: (props: Record<string, unknown>) => {
    nameEditorProps.push(props);
    return (
      <input
        aria-label="Dictionary entry name"
        readOnly
        value={String(props.name)}
      />
    );
  },
  TextValueEditor: (props: Record<string, unknown>) => {
    valueEditorProps.push(props);
    return (
      <input
        aria-label={String(props.ariaLabel)}
        disabled={Boolean(props.disabled)}
        readOnly
        value={String(props.value)}
      />
    );
  },
  WorkspaceItemList: ({
    renderItem,
    sectionId,
    topLevelItemIds,
    ...props
  }: {
    renderItem: (context: {
      item: { children: string[]; data: Record<string, string>; id: string };
      sectionId: string;
    }) => ReactNode;
    sectionId: string;
    topLevelItemIds: string[];
  }) => {
    itemListProps.push(props);
    return (
      <div data-testid="dictionary-entry-list">
        {topLevelItemIds.map((itemId) => {
          const item = dictionaryRows.find((row) => row.id === itemId);
          return item === undefined ? null : (
            <div key={item.id}>{renderItem({ item, sectionId })}</div>
          );
        })}
      </div>
    );
  },
}));

import {
  ParameterDictionarySection,
  dictionaryEntryNameErrors,
  readDictionaryEntryItemData,
  readParameterDictionarySectionData,
} from "./ParamDictSection";
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
  dictionaryRows.length = 0;
  itemListProps.length = 0;
  nameEditorProps.length = 0;
  valueEditorProps.length = 0;
});

describe("ParameterDictionarySection", () => {
  it("renders editable leaf rows, preserves empty parents, and delegates entry changes", () => {
    const onDictionaryEntryExpressionChange = vi.fn();
    const onDictionaryEntryNameChange = vi.fn();
    dictionaryRows.push(
      {
        children: [],
        data: {
          authoredExpression: "missing_radius",
          kind: "leaf",
          name: "radius",
        },
        id: "entry:radius",
      },
      {
        children: [],
        data: { kind: "parent", name: "options" },
        id: "entry:options",
      },
    );

    render(
      <ParameterDictionarySection
        data={{
          dictionary: { id: "dictionary:options", name: "Options" },
          entryDiagnostics: {
            "entry:radius": [
              { message: '"missing_radius" is not defined', severity: "error" },
            ],
          },
        }}
        itemTree={{
          items: {
            root: { children: ["entry:radius", "entry:options"], id: "root" },
            "entry:options": dictionaryRows[1]!,
            "entry:radius": dictionaryRows[0]!,
          },
          rootId: "root",
          selectedItemIds: [],
        }}
        sectionId="python-canvas:parameter-dictionary:dictionary:options"
      />,
      {
        ...mutationContext(),
        onDictionaryEntryExpressionChange,
        onDictionaryEntryNameChange,
      },
    );

    expect(nameEditorProps).toHaveLength(2);
    expect(valueEditorProps).toHaveLength(1);
    expect(valueEditorProps[0]).toMatchObject({
      ariaLabel: "radius expression",
      presentation: "item-row",
      value: "missing_radius",
    });
    expect(valueEditorProps[0]?.disabled).toBeUndefined();
    expect(itemListProps[0]?.itemDiagnostics).toEqual({
      "entry:radius": [
        { message: '"missing_radius" is not defined', severity: "error" },
      ],
    });
    const isGroupItem = itemListProps[0]?.isGroupItem as
      ((item: (typeof dictionaryRows)[number]) => boolean) | undefined;
    expect(isGroupItem?.(dictionaryRows[1]!)).toBe(true);

    (nameEditorProps[0]?.onNameChange as (name: string) => void)("size");
    (valueEditorProps[0]?.onValueChange as (value: string) => void)("4");
    expect(onDictionaryEntryNameChange).toHaveBeenCalledWith(
      "dictionary:options",
      "entry:radius",
      "size",
    );
    expect(onDictionaryEntryExpressionChange).toHaveBeenCalledWith(
      "dictionary:options",
      "entry:radius",
      "4",
    );
  });

  it("reports recursive sibling name validation at the visible rows", () => {
    expect(
      dictionaryEntryNameErrors({
        items: {
          a: {
            children: ["nested"],
            data: { kind: "parent", name: "same" },
            id: "a",
          },
          b: {
            children: [],
            data: { authoredExpression: "2", kind: "leaf", name: "same" },
            id: "b",
          },
          nested: {
            children: [],
            data: { authoredExpression: "", kind: "leaf", name: "" },
            id: "nested",
          },
          root: { children: ["a", "b"], id: "root" },
        },
        rootId: "root",
        selectedItemIds: [],
      }),
    ).toEqual({
      a: 'Dictionary entry name "same" already exists under this parent.',
      b: 'Dictionary entry name "same" already exists under this parent.',
      nested: "Dictionary entry name is required.",
    });
  });

  it("keeps section and entry data closed at the rendering boundary", () => {
    expect(() =>
      readParameterDictionarySectionData({
        dictionary: { id: "dictionary:one", name: "One" },
        entryDiagnostics: {},
        unexpected: true,
      }),
    ).toThrow("unexpected fields");
    expect(() =>
      readDictionaryEntryItemData({
        authoredExpression: "1",
        kind: "parent",
        name: "invalid",
      }),
    ).toThrow("unexpected fields");
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

function mutationContext() {
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
