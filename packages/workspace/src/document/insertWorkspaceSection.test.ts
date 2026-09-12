import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import { insertWorkspaceSection } from "./insertWorkspaceSection";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "./stores";
import type { WorkspaceDocument, WorkspaceSectionInput } from "./types";

function createSection(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
) {
  return {
    id,
    kind: "leaf",
    name: id,
    data: { body: id },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    ...overrides,
  } satisfies WorkspaceSectionInput;
}

function resetStores(): void {
  testWorkspace.document.getState().reset();
  testWorkspace.nodeInternals.getState().reset();
  testWorkspace.activeSections.getState().reset();
  testWorkspace.reactFlow.setState({ ...initialCanvasState });
}

describe("insertWorkspaceSection", () => {
  beforeEach(() => {
    resetStores();
    registerSectionKinds(testWorkspace.host, {
      leaf: {
        renderContent: () => null,
        defaultSize: { width: 240, height: 120 },
      },
    });
    loadWorkspaceDocument(testWorkspace.host, {
      sections: { existing: createSection("existing") },
      topLevelSections: {
        existing: { x: 10, y: 20, w: 240, h: 120, zIndex: 4 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
      savedViews: null,
    });
  });

  afterEach(() => {
    registerSectionKinds(testWorkspace.host, {});
    resetStores();
  });

  it("resolves, inserts, selects, and reports a host-created section once", () => {
    const onChange = vi.fn<(document: WorkspaceDocument) => void>();
    testWorkspace.host.subscribe(onChange);

    insertWorkspaceSection(testWorkspace.host, createSection("created"), {
      x: 125.5,
      y: -40,
    });

    const state = testWorkspace.document.getState();
    expect(state.sections["created"]?.size).toEqual({
      width: 240,
      height: 120,
    });
    expect(state.topLevelSections["created"]).toEqual({
      x: 125.5,
      y: -40,
      w: 240,
      h: 120,
      zIndex: 5,
    });
    expect(
      testWorkspace.nodeInternals.getState().x.get("created"),
    ).toMatchObject({
      position: { x: 125.5, y: -40 },
      width: 240,
      height: 120,
      zIndex: 5,
    });
    expect(testWorkspace.activeSections.getState().activeIds).toEqual([
      "created",
    ]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("publishes the document, node, and selection as one observable state", () => {
    const observed: Array<{
      sectionExists: boolean;
      activeIds: Array<string>;
    }> = [];
    const unsubscribe = testWorkspace.nodeInternals.subscribe(() => {
      observed.push({
        sectionExists: Boolean(
          testWorkspace.document.getState().sections["created"],
        ),
        activeIds: testWorkspace.activeSections.getState().activeIds,
      });
    });
    try {
      insertWorkspaceSection(testWorkspace.host, createSection("created"), {
        x: 0,
        y: 0,
      });
    } finally {
      unsubscribe();
    }
    expect(observed).toEqual([{ sectionExists: true, activeIds: ["created"] }]);
  });

  it("rejects duplicates, non-finite placement, and preclaimed children before mutation", () => {
    expect(() =>
      insertWorkspaceSection(testWorkspace.host, createSection("existing"), {
        x: 0,
        y: 0,
      }),
    ).toThrow(/duplicate workspace section existing/);
    expect(() =>
      insertWorkspaceSection(
        testWorkspace.host,
        createSection("invalid-position"),
        {
          x: Number.NaN,
          y: 0,
        },
      ),
    ).toThrow(/finite position/);
    expect(() =>
      insertWorkspaceSection(
        testWorkspace.host,
        createSection("parent", { children: ["existing"] }),
        { x: 0, y: 0 },
      ),
    ).toThrow(/without existing child claims/);
    expect(Object.keys(testWorkspace.document.getState().sections)).toEqual([
      "existing",
    ]);
  });
});
