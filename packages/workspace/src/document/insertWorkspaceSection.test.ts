import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../canvas/store";
import {
  setWorkspaceDocumentChangeCallback,
  type WorkspaceDocumentChangeCallback,
} from "./documentChangeCallback";
import { insertWorkspaceSection } from "./insertWorkspaceSection";
import { loadWorkspaceDocument } from "./loadWorkspaceDocument";
import { registerSectionKinds } from "./sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "./stores";
import type { WorkspaceSectionInput } from "./types";

function createSection(id: string, overrides: Partial<WorkspaceSectionInput> = {}) {
  return {
    id,
    kind: "leaf",
    name: id,
    data: { body: id },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
    ...overrides,
  } satisfies WorkspaceSectionInput;
}

function resetStores(): void {
  useWorkspaceDocument.getState().reset();
  useNodeInternals.getState().reset();
  useActiveSections.getState().reset();
  useReactFlow.setState({ ...initialCanvasState });
}

describe("insertWorkspaceSection", () => {
  beforeEach(() => {
    resetStores();
    registerSectionKinds({
      leaf: { renderContent: () => null, defaultSize: { width: 240, height: 120 } },
    });
    loadWorkspaceDocument({
      sections: { existing: createSection("existing") },
      topLevelSections: {
        existing: { x: 10, y: 20, w: 240, h: 120, zIndex: 4 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      activeIds: [],
    });
  });

  afterEach(() => {
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    resetStores();
  });

  it("resolves, inserts, selects, and reports a host-created section once", () => {
    const onChange = vi.fn<WorkspaceDocumentChangeCallback>();
    setWorkspaceDocumentChangeCallback(onChange);

    insertWorkspaceSection(createSection("created"), { x: 125.5, y: -40 });

    const state = useWorkspaceDocument.getState();
    expect(state.sections["created"]?.size).toEqual({ width: 240, height: 120 });
    expect(state.topLevelSections["created"]).toEqual({
      x: 125.5,
      y: -40,
      w: 240,
      h: 120,
      zIndex: 5,
    });
    expect(useNodeInternals.getState().x.get("created")).toMatchObject({
      position: { x: 125.5, y: -40 },
      width: 240,
      height: 120,
      zIndex: 5,
    });
    expect(useActiveSections.getState().activeIds).toEqual(["created"]);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("publishes the document, node, and selection as one observable state", () => {
    const observed: Array<{ sectionExists: boolean; activeIds: Array<string> }> = [];
    const unsubscribe = useNodeInternals.subscribe(() => {
      observed.push({
        sectionExists: Boolean(useWorkspaceDocument.getState().sections["created"]),
        activeIds: useActiveSections.getState().activeIds,
      });
    });
    try {
      insertWorkspaceSection(createSection("created"), { x: 0, y: 0 });
    } finally {
      unsubscribe();
    }
    expect(observed).toEqual([{ sectionExists: true, activeIds: ["created"] }]);
  });

  it("rejects duplicates, non-finite placement, and preclaimed children before mutation", () => {
    expect(() => insertWorkspaceSection(createSection("existing"), { x: 0, y: 0 })).toThrow(
      /duplicate workspace section existing/,
    );
    expect(() =>
      insertWorkspaceSection(createSection("invalid-position"), { x: Number.NaN, y: 0 }),
    ).toThrow(/finite position/);
    expect(() =>
      insertWorkspaceSection(createSection("parent", { children: ["existing"] }), { x: 0, y: 0 }),
    ).toThrow(/without existing child claims/);
    expect(Object.keys(useWorkspaceDocument.getState().sections)).toEqual(["existing"]);
  });
});
