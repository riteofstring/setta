/* @vitest-environment jsdom */
import type { WorkspaceDocument, WorkspaceHost } from "@setta/workspace";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const workspaceMocks = vi.hoisted(() => ({
  host: null as WorkspaceHost | null,
  parameterViewSectionIds: [] as Array<string>,
}));

vi.mock("@setta/workspace", () => ({
  WorkspaceParameterConfigurationView: ({
    sectionId,
  }: {
    sectionId: string;
  }) => {
    workspaceMocks.parameterViewSectionIds.push(sectionId);
    return <div data-parameter-view={sectionId} />;
  },
  useWorkspaceDocumentSnapshot: () => {
    const host = workspaceMocks.host;
    if (host === null) {
      throw new Error("Expected a workspace host.");
    }
    const [snapshot, setSnapshot] = useState(() => host.getSnapshot());
    useEffect(() => host.subscribe(setSnapshot), [host]);
    return snapshot;
  },
}));

import {
  PythonCanvasParamsPane,
  getPythonCanvasParamsPaneModel,
} from "./PythonCanvasParamsPane";
import {
  CALLABLE_SECTION_KIND,
  PARAMETER_DICTIONARY_SECTION_KIND,
} from "./workspaceProjection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  workspaceMocks.host = null;
  workspaceMocks.parameterViewSectionIds.length = 0;
});

function documentWithActiveSection(
  kind: string,
  activeIds: Array<string> = ["section"],
  withItems = true,
): WorkspaceDocument {
  return {
    activeIds,
    sections: {
      section: {
        children: [],
        id: "section",
        isHorizontalOrientation: false,
        isMinimized: false,
        itemTree: withItems
          ? {
              items: { root: { children: [], id: "root" } },
              rootId: "root",
              selectedItemIds: [],
            }
          : undefined,
        kind,
        name: "Section",
        overflowMode: false,
        positionAndSizeLocked: false,
        size: { height: 150, width: 250 },
        styleColor: null,
        tagColor: null,
      },
    },
    topLevelSections: {
      section: { h: 150, w: 250, x: 0, y: 0, zIndex: 0 },
    },
    viewport: null,
  };
}

describe("PythonCanvasParamsPane", () => {
  it("accepts one selected callable or Parameter Dictionary with an item tree", () => {
    expect(
      getPythonCanvasParamsPaneModel(
        documentWithActiveSection(CALLABLE_SECTION_KIND),
      )?.section.id,
    ).toBe("section");
    expect(
      getPythonCanvasParamsPaneModel(
        documentWithActiveSection(PARAMETER_DICTIONARY_SECTION_KIND),
      )?.section.id,
    ).toBe("section");
    expect(
      getPythonCanvasParamsPaneModel(
        documentWithActiveSection(CALLABLE_SECTION_KIND, ["section", "other"]),
      ),
    ).toBeNull();
    expect(
      getPythonCanvasParamsPaneModel(
        documentWithActiveSection("python-canvas.list"),
      ),
    ).toBeNull();
    expect(
      getPythonCanvasParamsPaneModel(
        documentWithActiveSection(CALLABLE_SECTION_KIND, ["section"], false),
      ),
    ).toBeNull();
  });

  it("delegates both section types to the shared parameter configuration view", async () => {
    let snapshot = documentWithActiveSection(CALLABLE_SECTION_KIND);
    const listeners = new Set<(document: WorkspaceDocument) => void>();
    workspaceMocks.host = {
      dispose: () => {},
      getSnapshot: () => snapshot,
      loadDocument: () => {},
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<PythonCanvasParamsPane />));

    expect(
      container.querySelector("[data-parameter-view='section']"),
    ).not.toBeNull();

    snapshot = documentWithActiveSection(PARAMETER_DICTIONARY_SECTION_KIND);
    await act(async () => {
      for (const listener of listeners) {
        listener(snapshot);
      }
    });
    expect(workspaceMocks.parameterViewSectionIds.at(-1)).toBe("section");
  });
});
