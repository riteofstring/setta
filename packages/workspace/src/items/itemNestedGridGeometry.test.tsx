/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postcss from "postcss";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import tailwindcss from "tailwindcss";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { useItemDndChildren } from "../dnd/itemDndChildren";
import { ItemDndContext } from "../dnd/ItemDndContext";
import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type { ItemRowRenderContext } from "./ItemListContext";
import { resetItemListViews } from "./itemListRegistry";
import { WorkspaceItemList } from "./WorkspaceItemList";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function getPackageRoot(): string {
  const testPath = expect.getState().testPath;
  if (!testPath) {
    throw new Error("expected vitest to expose the test path");
  }
  return join(dirname(testPath), "../..");
}

function inlineRelativeImports(css: string, fromDirectory: string): string {
  return css.replace(/^@import\s+(.+);$/gm, (statement, specifier: string) => {
    const relativePath = /^"(\.\/[^"]+)"$/.exec(specifier.trim())?.[1];
    if (!relativePath) {
      throw new Error(`unsupported stylesheet import: ${statement}`);
    }
    return readFileSync(join(fromDirectory, relativePath), "utf8");
  });
}

function parseAreaColumnNames(gridTemplateAreas: string): Array<string> {
  const firstRow = /"([^"]*)"/.exec(gridTemplateAreas)?.[1];
  if (firstRow === undefined) {
    throw new Error(
      `no named grid areas in ${JSON.stringify(gridTemplateAreas)}`,
    );
  }
  return firstRow.trim().split(/\s+/);
}

function resolveNamedColumnSpan(
  areaColumns: Array<string>,
  gridColumn: string,
) {
  const parts = gridColumn.split("/").map((part) => part.trim());
  const startName = parts[0];
  const endName = parts[1];
  if (startName === undefined || endName === undefined) {
    return null;
  }
  const startTrack = areaColumns.indexOf(startName);
  const endTrack = areaColumns.lastIndexOf(endName);
  if (startTrack === -1 || endTrack === -1) {
    return null;
  }
  return { startLine: startTrack + 1, endLine: endTrack + 2 };
}

function getItemField(
  item: ItemRowRenderContext["item"],
  field: string,
): unknown {
  const data = item.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`item ${item.id} is missing its row data`);
  }
  return (data as Record<string, unknown>)[field];
}

function isGroupItem(item: ItemRowRenderContext["item"]): boolean {
  return getItemField(item, "group") === true;
}

function renderRowContent(context: ItemRowRenderContext) {
  const label = String(getItemField(context.item, "label"));
  if (isGroupItem(context.item)) {
    return createElement(
      "p",
      { "data-testid": `label-${context.item.id}` },
      label,
    );
  }
  return createElement(
    "div",
    {
      className: "section-key overflow-hidden",
      "data-testid": `label-${context.item.id}`,
    },
    label,
  );
}

function loadRejectedScene() {
  registerSectionKinds(testWorkspace.host, {
    leaf: {
      renderContent: () => null,
      itemArea: { toolbar: "authoring-and-filter" },
    },
  });

  const ids: Record<
    string,
    { label: string; group?: boolean; children: Array<string> }
  > = {
    "item-root": {
      label: "root",
      children: ["item-alpha", "item-options", "item-beta"],
    },
    "item-alpha": { label: "alpha", children: [] },
    "item-options": {
      label: "options",
      group: true,
      children: ["item-momentum", "item-decay"],
    },
    "item-momentum": { label: "momentum", children: [] },
    "item-decay": { label: "decay", children: [] },
    "item-beta": { label: "beta", children: ["item-gamma"] },
    "item-gamma": { label: "gamma", children: [] },
  };
  loadWorkspaceDocument(testWorkspace.host, {
    sections: {
      panel: {
        id: "panel",
        kind: "leaf",
        name: "panel",
        size: { width: 280, height: 240 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
        itemTree: {
          rootId: "item-root",
          items: Object.fromEntries(
            Object.entries(ids).map(([id, entry]) => [
              id,
              {
                id,
                children: entry.children,
                ...(id === "item-root"
                  ? {}
                  : {
                      data: { label: entry.label, group: entry.group === true },
                    }),
              },
            ]),
          ),
          selectedItemIds: [],
        },
      },
    },
    topLevelSections: { panel: { x: 0, y: 0, w: 280, h: 240, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
    savedViews: null,
  });
}

describe("nested item grid geometry from the compiled stylesheet", () => {
  let styleElement: HTMLStyleElement;
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    const packageRoot = getPackageRoot();
    const configModule = (await import("../../tailwind.config.js")) as {
      default: Record<string, unknown>;
    };
    const inputPath = join(packageRoot, "src/styles/index.css");
    const input = inlineRelativeImports(
      readFileSync(inputPath, "utf8"),
      dirname(inputPath),
    );
    const compiled = await postcss([
      tailwindcss({
        ...configModule.default,
        content: [join(packageRoot, "src/**/*.{ts,tsx}")],
      } as never),
    ]).process(input, { from: inputPath });

    styleElement = document.createElement("style");
    styleElement.textContent = compiled.css;
    document.head.appendChild(styleElement);
  }, 60_000);

  afterAll(() => {
    styleElement.remove();
  });

  beforeEach(async () => {
    loadRejectedScene();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(
            ItemDndContext,
            null,
            createElement(WorkspaceItemList, {
              sectionId: "panel",
              listKey: "main",
              topLevelItemIds: ["item-alpha", "item-options", "item-beta"],
              renderItem: renderRowContent,
              isGroupItem,
            }),
          )}
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    registerSectionKinds(testWorkspace.host, {});
    resetItemListViews(testWorkspace.host);
    testWorkspace.document.getState().reset();
    testWorkspace.nodeInternals.getState().reset();
    testWorkspace.activeSections.getState().reset();
    testWorkspace.capabilities.getState().reset();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.itemDndState.getState().reset();
    testWorkspace.itemDndChildren.getState().reset();
    testWorkspace.reactFlow.setState({ ...initialCanvasState });
  });

  function getRow(itemId: string): HTMLElement {
    const row = host
      .querySelector(`[data-testid="label-${itemId}"]`)
      ?.closest<HTMLElement>("[data-item-row]");
    if (!row) {
      throw new Error(`expected a rendered row for ${itemId}`);
    }
    return row;
  }

  function getGroupLabelRuleGridColumn(): string {
    const groupLabelSelector = String.raw`.\[\&\>p\]\:section-key-value > p`;
    for (const rule of styleElement.sheet?.cssRules ?? []) {
      if (
        rule instanceof window.CSSStyleRule &&
        rule.selectorText === groupLabelSelector
      ) {
        return rule.style.getPropertyValue("grid-column");
      }
    }
    throw new Error("expected the compiled group-label placement rule");
  }

  it("gives the list-area shell the reference's definite named grid", () => {
    const shell = host.querySelector<HTMLElement>("div.overflow-y-scroll");
    if (!shell) {
      throw new Error("expected the package-owned list-area shell");
    }
    const shellStyle = getComputedStyle(shell);
    expect(shellStyle.getPropertyValue("grid-template-columns")).toBe(
      "0.75rem 1fr 0.75rem 1fr",
    );
    const areaColumns = parseAreaColumnNames(
      shellStyle.getPropertyValue("grid-template-areas"),
    );
    expect(areaColumns).toEqual([
      "left-gutter",
      "key",
      "center-gutter",
      "value",
    ]);

    const leafSpan = resolveNamedColumnSpan(
      areaColumns,
      getComputedStyle(getRow("item-alpha")).getPropertyValue("grid-column"),
    );
    expect(leafSpan).toEqual({ startLine: 2, endLine: 5 });
    const groupSpan = resolveNamedColumnSpan(
      areaColumns,
      getComputedStyle(getRow("item-options")).getPropertyValue("grid-column"),
    );
    expect(groupSpan).toEqual({ startLine: 1, endLine: 5 });
  });

  it("stacks a group's children beneath its label instead of an implicit side column", () => {
    const groupRow = getRow("item-options");

    expect(groupRow.style.gridTemplateColumns.match(/\[c\d\]/g)).toHaveLength(
      5,
    );
    const areaColumns = parseAreaColumnNames(
      getComputedStyle(groupRow).getPropertyValue("grid-template-areas"),
    );
    expect(areaColumns).toEqual([
      "left-gutter",
      "key",
      "center-gutter",
      "value",
    ]);

    const label = host.querySelector<HTMLElement>(
      '[data-testid="label-item-options"]',
    );
    if (!label) {
      throw new Error("expected the group label");
    }
    expect(groupRow.className).toContain("[&>p]:section-key-value");
    expect(label.tagName).toBe("P");
    expect(label.parentElement).toBe(groupRow);
    const labelSpan = resolveNamedColumnSpan(
      areaColumns,
      getGroupLabelRuleGridColumn(),
    );
    const rail = groupRow.querySelector<HTMLElement>("div.section-args-nested");
    if (!rail) {
      throw new Error("expected the nested-children rail");
    }
    const railSpan = resolveNamedColumnSpan(
      areaColumns,
      getComputedStyle(rail).getPropertyValue("grid-column"),
    );

    expect(labelSpan).toEqual({ startLine: 2, endLine: 5 });
    expect(railSpan).toEqual({ startLine: 2, endLine: 5 });
  });

  it("keeps the nested rail and child rows on the reference's named grids", () => {
    const rail = getRow("item-options").querySelector<HTMLElement>(
      "div.section-args-nested",
    );
    if (!rail) {
      throw new Error("expected the nested-children rail");
    }
    const railStyle = getComputedStyle(rail);
    expect(railStyle.getPropertyValue("grid-template-columns")).toBe(
      "0.75rem 1fr 0.75rem 1fr",
    );
    const railColumns = parseAreaColumnNames(
      railStyle.getPropertyValue("grid-template-areas"),
    );
    expect(railColumns).toEqual([
      "left-gutter",
      "key",
      "center-gutter",
      "value",
    ]);

    for (const childId of ["item-momentum", "item-decay"]) {
      const childRow = getRow(childId);
      const childSpan = resolveNamedColumnSpan(
        railColumns,
        getComputedStyle(childRow).getPropertyValue("grid-column"),
      );
      expect(childSpan).toEqual({ startLine: 2, endLine: 5 });
      const childColumns = parseAreaColumnNames(
        getComputedStyle(childRow).getPropertyValue("grid-template-areas"),
      );
      expect(childColumns).toEqual(["key", "center-gutter", "value"]);
    }
  });

  it("names the nested-root row's grid from the stylesheet alone", () => {
    const nestedRootRow = getRow("item-beta");
    expect(nestedRootRow.className).toContain("section-args-nested-key-value");
    expect(nestedRootRow.style.gridTemplateAreas).toBe("");
    const areaColumns = parseAreaColumnNames(
      getComputedStyle(nestedRootRow).getPropertyValue("grid-template-areas"),
    );
    expect(areaColumns).toEqual(["key", "center-gutter", "value"]);

    const rail = nestedRootRow.querySelector<HTMLElement>(
      "div.section-args-nested",
    );
    if (!rail) {
      throw new Error("expected the nested-children rail");
    }
    const railSpan = resolveNamedColumnSpan(
      areaColumns,
      getComputedStyle(rail).getPropertyValue("grid-column"),
    );
    expect(railSpan).toEqual({ startLine: 1, endLine: 4 });
  });
});
