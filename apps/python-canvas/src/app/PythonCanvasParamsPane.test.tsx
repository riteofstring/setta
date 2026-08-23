/* @vitest-environment jsdom */
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";
import { act, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const workspaceMocks = vi.hoisted(() => ({
  host: null as WorkspaceHost | null,
}));

vi.mock("@setta/workspace", () => ({
  ItemDndContext: ({ children }: { children?: ReactNode }) => children,
  ItemNameEditor: () => null,
  TextValueEditor: () => null,
  WORKSPACE_CODE_SECTION_KIND: "workspace.code",
  WorkspaceItemLabel: ({ children }: { children?: ReactNode }) => children,
  WorkspaceItemList: () => null,
  commitWorkspaceDocument: () => {},
  createWorkspaceCodeSectionData: () => ({}),
  getWorkspaceCodeSectionData: () => ({}),
  setItemData: () => {},
  useWorkspaceDocumentSnapshot: () => {
    const host = workspaceMocks.host;
    if (host === null) {
      throw new Error("Expected a workspace host.");
    }
    const [snapshot, setSnapshot] = useState(() => host.getSnapshot());
    useEffect(() => host.subscribe(setSnapshot), [host]);
    return snapshot;
  },
  useWorkspaceHost: () => {
    if (workspaceMocks.host === null) {
      throw new Error("Expected a workspace host.");
    }
    return workspaceMocks.host;
  },
}));

import {
  PythonCanvasParamsPane,
  getPythonCanvasParamsPaneModel,
} from "./PythonCanvasParamsPane";
import {
  PARAMETER_DICTIONARY_SECTION_KIND,
  CALLABLE_SECTION_KIND,
} from "./workspaceProjection";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  workspaceMocks.host = null;
});

function parameter(
  id: string,
  {
    defaultValue = null,
    name = id,
    providerOrdinal = 0,
    typeAnnotation = null,
  }: {
    defaultValue?: string | null;
    name?: string;
    providerOrdinal?: number | null;
    typeAnnotation?: string | null;
  } = {},
) {
  return {
    children: [],
    data: {
      authoredExpression: `expression:${id}`,
      default: defaultValue,
      name,
      nameEditable: providerOrdinal === null,
      passingStyle: "positional_or_keyword",
      providerOrdinal,
      typeAnnotation,
    },
    id,
  };
}

function callableDocument({
  activeIds = ["callable"],
  kind = CALLABLE_SECTION_KIND,
}: {
  activeIds?: Array<string>;
  kind?: string;
} = {}): WorkspaceDocument {
  const rootId = "parameter-root";
  const alpha = parameter("alpha", {
    defaultValue: "1",
    providerOrdinal: 0,
    typeAnnotation: "int",
  });
  const beta = parameter("beta", { providerOrdinal: 1 });
  const authored = parameter("authored", { providerOrdinal: null });
  return {
    activeIds,
    sections: {
      callable: {
        children: [],
        id: "callable",
        isHorizontalOrientation: false,
        isMinimized: false,
        itemTree: {
          items: {
            [rootId]: {
              children: [alpha.id, beta.id, authored.id],
              id: rootId,
            },
            [alpha.id]: alpha,
            [authored.id]: authored,
            [beta.id]: beta,
          },
          rootId,
          selectedItemIds: [],
        },
        kind,
        name: "Callable",
        overflowMode: false,
        positionAndSizeLocked: false,
        size: { height: 150, width: 250 },
        styleColor: null,
        tagColor: null,
      },
    },
    topLevelSections: {
      callable: { h: 150, w: 250, x: 0, y: 0, zIndex: 0 },
    },
    viewport: null,
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) {
    throw new Error("Expected the native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PythonCanvasParamsPane", () => {
  it("accepts only a sole callable with provider-backed parameter rows", () => {
    const available = getPythonCanvasParamsPaneModel(callableDocument());

    expect(
      available?.parameters.map((parameter) => parameter.data.name),
    ).toEqual(["alpha", "beta"]);
    expect(
      getPythonCanvasParamsPaneModel(
        callableDocument({ activeIds: ["callable", "other"] }),
      ),
    ).toBeNull();
    expect(
      getPythonCanvasParamsPaneModel(
        callableDocument({ kind: PARAMETER_DICTIONARY_SECTION_KIND }),
      ),
    ).toBeNull();
  });

  it("renders filterable provider metadata without an authored expression editor", async () => {
    let snapshot = callableDocument();
    const listeners = new Set<() => void>();
    workspaceMocks.host = {
      dispose: () => {},
      // The real host creates a fresh serializable envelope for each direct read.
      getSnapshot: () => ({ ...snapshot }),
      loadDocument: () => {},
      subscribe: (listener) => {
        const notify = () => listener(snapshot);
        listeners.add(notify);
        return () => listeners.delete(notify);
      },
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<PythonCanvasParamsPane />);
    });

    const filter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter parameters"]',
    );
    if (!filter) {
      throw new Error("Expected the Params filter.");
    }
    expect(filter.placeholder).toBe("Filter");
    expect(
      container.querySelector(".python-canvas-params-filter .gg-sort-az"),
    ).not.toBeNull();
    expect(
      container.querySelector(".python-canvas-params-list"),
    ).not.toBeNull();
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("Type");
    expect(container.textContent).toContain("int");
    expect(container.textContent).toContain("Provider default");
    expect(container.textContent).toContain("Provider order");
    expect(container.textContent).toContain("beta");
    expect(container.textContent).not.toContain("authored");
    expect(container.textContent).not.toContain("expression:alpha");
    expect(container.querySelectorAll("input")).toHaveLength(1);

    await act(async () => {
      setInputValue(filter, "beta");
    });
    expect(container.textContent).toContain("beta");
    expect(container.textContent).not.toContain("alpha");

    snapshot = callableDocument({ kind: PARAMETER_DICTIONARY_SECTION_KIND });
    await act(async () => {
      for (const listener of listeners) {
        listener();
      }
    });
    expect(
      container.querySelector("[data-python-canvas-params-pane]"),
    ).toBeNull();
  });
});
