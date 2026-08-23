import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const itemListProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@setta/workspace", () => ({
  ItemDndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  WorkspaceItemList: (props: Record<string, unknown>) => {
    itemListProps.push(props);
    return <div data-testid="dictionary-entry-list" />;
  },
}));

import {
  ParameterDictionarySection,
  dictionaryEntryNameErrors,
  readDictionaryEntryItem,
  readDictionaryEntryItemData,
  readParameterDictionarySectionData,
} from "./ParamDictSection";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  root = undefined;
  container?.remove();
  container = undefined;
  itemListProps.length = 0;
});

describe("ParameterDictionarySection", () => {
  it("delegates typed leaves and nested parents to the built-in workspace list", () => {
    const itemTree = {
      items: {
        root: { children: ["entry:radius", "entry:options"], id: "root" },
        "entry:radius": codeItem(
          "entry:radius",
          "radius",
          "missing_radius",
        ),
        "entry:options": {
          children: [],
          id: "entry:options",
          presentation: {
            control: { kind: "group" as const },
            label: "options",
            labelEditable: true,
          },
        },
      },
      rootId: "root",
      selectedItemIds: [],
    };

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
        itemTree={itemTree}
        sectionId="python-canvas:parameter-dictionary:dictionary:options"
      />,
    );

    expect(itemListProps[0]).toMatchObject({
      itemDiagnostics: {
        "entry:radius": [
          { message: '"missing_radius" is not defined', severity: "error" },
        ],
      },
      topLevelItemIds: ["entry:radius", "entry:options"],
    });
    expect(readDictionaryEntryItem(itemTree.items["entry:radius"])).toEqual({
      authoredExpression: "missing_radius",
      kind: "leaf",
      name: "radius",
    });
    expect(readDictionaryEntryItem(itemTree.items["entry:options"])).toEqual({
      kind: "parent",
      name: "options",
    });
  });

  it("reports recursive sibling name validation at visible typed rows", () => {
    expect(
      dictionaryEntryNameErrors({
        items: {
          a: {
            ...groupItem("a", "same"),
            children: ["nested"],
          },
          b: codeItem("b", "same", "2"),
          nested: codeItem("nested", "", ""),
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

  it("keeps section and legacy entry parsing closed at the rendering boundary", () => {
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

function codeItem(id: string, label: string, value: string) {
  return {
    children: [],
    id,
    presentation: {
      control: {
        kind: "code" as const,
        value,
        configuration: {
          autocomplete: "off" as const,
          disabled: false,
          language: "python" as const,
          placeholder: null,
          singleLine: true,
          wrapLines: true,
        },
      },
      label,
      labelEditable: true,
    },
  };
}

function groupItem(id: string, label: string) {
  return {
    children: [],
    id,
    presentation: {
      control: { kind: "group" as const },
      label,
      labelEditable: true,
    },
  };
}

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}
