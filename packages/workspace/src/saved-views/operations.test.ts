import { afterEach, describe, expect, it } from "vitest";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { setActiveSectionIds } from "../document/activeSections";
import { applyActiveSectionChange } from "../canvas/activeSectionController";
import { startCanvasViewportDocumentSync } from "../canvas/documentViewportSync";
import { updatePositions } from "../canvas/useUpdateNodePositions";
import {
  getWorkspaceDocument,
  notifyWorkspaceDocumentChange,
} from "../document/documentChangeCallback";
import { commitWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import { getReactFlowStore } from "../canvas/store";
import { getWorkspaceMenuStateStore } from "../context-menu/workspaceMenuState";
import {
  activateDndMovingFreeMode,
  getDndStateStore,
  setActiveDnd,
} from "../dnd/dndState";
import type {
  WorkspaceDocument,
  WorkspaceDocumentInput,
  WorkspaceSectionInput,
} from "../document/types";
import { getWorkspaceHistoryState } from "../history/workspaceHistory";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  activateWorkspaceSavedView,
  createWorkspaceSavedView,
  deleteWorkspaceSavedView,
  enableWorkspaceSavedViews,
  getWorkspaceSavedViewsOperationDisabledReason,
  getWorkspaceSavedViewsState,
  renameWorkspaceSavedView,
  reorderWorkspaceSavedView,
  setWorkspaceSavedViewSectionVisibility,
} from "./operations";
import {
  createWorkspaceSavedViewsState,
  parseWorkspaceSavedViewsState,
  projectWorkspaceDocumentSavedViews,
} from "./state";

const hosts: Array<WorkspaceHost> = [];

function section(
  id: string,
  overrides: Partial<WorkspaceSectionInput> = {},
): WorkspaceSectionInput {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function document(
  overrides: Partial<WorkspaceDocumentInput> = {},
): WorkspaceDocumentInput {
  return {
    activeIds: ["alpha", "beta"],
    savedViews: null,
    sections: {
      alpha: section("alpha"),
      beta: section("beta"),
      group: section("group", { children: ["nested"], kind: "group" }),
      nested: section("nested"),
    },
    topLevelSections: {
      alpha: { h: 100, w: 200, x: 0, y: 0, zIndex: 0 },
      beta: { h: 100, w: 200, x: 240, y: 0, zIndex: 1 },
      group: { h: 160, w: 320, x: 0, y: 220, zIndex: 2 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

function createHost(history = false): WorkspaceHost {
  const host = createWorkspaceHost(
    history ? { history: { kind: "local" } } : {},
  );
  registerSectionKinds(host, { leaf: { renderContent: () => null } });
  hosts.push(host);
  return host;
}

function requireSavedViews(host: WorkspaceHost) {
  const savedViews = getWorkspaceSavedViewsState(host);
  if (savedViews === null) {
    throw new Error("Expected saved views to be enabled.");
  }
  return savedViews;
}

function mountFittedCanvas(host: WorkspaceHost): {
  stopViewportSync: () => void;
  transforms: Array<{ x: number; y: number; zoom: number }>;
} {
  const transforms: Array<{ x: number; y: number; zoom: number }> = [];
  const stopViewportSync = startCanvasViewportDocumentSync(host);
  getReactFlowStore(host).setState({
    d3Selection: {} as never,
    d3Zoom: {
      constrain: () => (transform: unknown) => transform,
      transform: (
        _selection: unknown,
        transform: { k: number; x: number; y: number },
      ) => {
        transforms.push({
          x: transform.x,
          y: transform.y,
          zoom: transform.k,
        });
        getReactFlowStore(host).setState({
          transform: [transform.x, transform.y, transform.k],
        });
      },
    } as never,
    height: 600,
    width: 800,
  });
  return { stopViewportSync, transforms };
}

function expectOneFittedSavedViewPublication(
  publications: Array<WorkspaceDocument>,
  activeViewId: string,
  transforms: Array<{ x: number; y: number; zoom: number }>,
): void {
  expect(publications).toHaveLength(1);
  const publication = publications[0];
  if (publication === undefined || publication.viewport === null) {
    throw new Error("Expected one publication with a fitted viewport.");
  }
  expect(publication.savedViews?.activeViewId).toBe(activeViewId);
  expect(publication.savedViews?.views[activeViewId]?.viewport).toEqual(
    publication.viewport,
  );
  expect(transforms).toHaveLength(1);
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
});

describe("workspace saved views", () => {
  it("strictly parses view records and rejects malformed ids, names, ordering, and geometry", () => {
    const valid = createWorkspaceSavedViewsState(document(), {
      id: "overview",
      name: "Overview",
    });
    expect(parseWorkspaceSavedViewsState(valid)).toEqual(valid);

    expect(() =>
      parseWorkspaceSavedViewsState({
        ...valid,
        activeViewId: "missing",
      }),
    ).toThrow(/does not exist/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        activeViewId: "constructor",
        views: {
          constructor: valid.views["overview"],
        },
      }),
    ).toThrow(/reserved id/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        activeViewId: "overview",
        views: {
          overview: valid.views["overview"],
          detail: {
            ...valid.views["overview"],
            id: "detail",
            sortIndex: 1,
          },
        },
      }),
    ).toThrow(/duplicated/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        activeViewId: "overview",
        views: {
          overview: valid.views["overview"],
          detail: {
            ...valid.views["overview"],
            id: "detail",
            name: "Detail",
            sortIndex: 0,
          },
        },
      }),
    ).toThrow(/sort index 0 is duplicated/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        activeViewId: "overview",
        views: {
          overview: { ...valid.views["overview"], sortIndex: 1 },
        },
      }),
    ).toThrow(/contiguous/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        ...valid,
        views: {
          overview: {
            ...valid.views["overview"],
            topLevelSections: {
              ...valid.views["overview"]?.topLevelSections,
              alpha: { h: 100, w: 200, x: Number.NaN, y: 0, zIndex: 0 },
            },
          },
        },
      }),
    ).toThrow(/finite number/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        ...valid,
        views: {
          overview: {
            ...valid.views["overview"],
            viewport: { x: 0, y: 0, zoom: 0 },
          },
        },
      }),
    ).toThrow(/greater than zero/u);
    expect(() =>
      parseWorkspaceSavedViewsState({
        ...valid,
        views: {
          overview: {
            ...valid.views["overview"],
            sectionVisibility: { alpha: "yes" },
          },
        },
      }),
    ).toThrow(/must be boolean/u);
  });

  it("creates, activates, renames, reorders, deletes, and keeps view-only changes out of history", () => {
    const host = createHost(true);
    host.loadDocument(document());

    expect(
      enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" }),
    ).toMatchObject({ activeViewId: "overview", status: "applied" });
    expect(
      createWorkspaceSavedView(host, { id: "detail", name: "Detail" }),
    ).toMatchObject({ activeViewId: "detail", status: "applied" });
    expect(renameWorkspaceSavedView(host, "detail", "Details")).toMatchObject({
      status: "applied",
      viewId: "detail",
    });
    expect(reorderWorkspaceSavedView(host, "detail", 0)).toMatchObject({
      status: "applied",
      viewId: "detail",
    });
    expect(
      Object.values(requireSavedViews(host).views)
        .sort((left, right) => left.sortIndex - right.sortIndex)
        .map((view) => view.id),
    ).toEqual(["detail", "overview"]);
    expect(getWorkspaceHistoryState(host).canUndo).toBe(false);

    expect(deleteWorkspaceSavedView(host, "overview")).toMatchObject({
      activeViewId: "detail",
      status: "applied",
    });
    expect(deleteWorkspaceSavedView(host, "detail")).toEqual({
      reason: "The last saved view cannot be deleted.",
      status: "unavailable",
    });
    expect(getWorkspaceHistoryState(host).canUndo).toBe(false);
  });

  it("atomically restores the selected presentation and prunes hidden selection", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    commitWorkspaceDocument(host, {
      ...host.getSnapshot(),
      topLevelSections: {
        ...host.getSnapshot().topLevelSections,
        alpha: { h: 100, w: 200, x: 500, y: 40, zIndex: 0 },
      },
      viewport: { x: 80, y: 40, zoom: 1.5 },
    });
    expect(
      requireSavedViews(host).views["detail"]?.topLevelSections["alpha"]?.x,
    ).toBe(500);
    expect(requireSavedViews(host).views["detail"]?.viewport).toEqual({
      x: 80,
      y: 40,
      zoom: 1.5,
    });
    setWorkspaceSavedViewSectionVisibility(host, ["alpha"], false);

    let publications = 0;
    const unsubscribe = host.subscribe(() => {
      publications += 1;
    });
    try {
      expect(activateWorkspaceSavedView(host, "overview")).toMatchObject({
        activeViewId: "overview",
        status: "applied",
      });
      setActiveSectionIds(host, ["alpha", "beta"]);
      publications = 0;
      expect(activateWorkspaceSavedView(host, "detail")).toMatchObject({
        activeViewId: "detail",
        status: "applied",
      });
    } finally {
      unsubscribe();
    }

    expect(publications).toBe(1);
    expect(host.getSnapshot().topLevelSections["alpha"]?.x).toBe(500);
    expect(host.getSnapshot().viewport).toEqual({ x: 80, y: 40, zoom: 1.5 });
    expect(host.getSnapshot().activeIds).toEqual(["beta"]);
    setActiveSectionIds(host, ["alpha", "beta"]);
    expect(host.getSnapshot().activeIds).toEqual(["beta"]);
  });

  it("projects target saved-view dimensions with matching document state to raw node subscribers", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    commitWorkspaceDocument(host, {
      ...host.getSnapshot(),
      topLevelSections: {
        ...host.getSnapshot().topLevelSections,
        alpha: { h: 260, w: 480, x: 600, y: 40, zIndex: 7 },
      },
    });
    activateWorkspaceSavedView(host, "overview");

    const observations: Array<{
      activeLayout: { h: number | null; w: number | null } | undefined;
      documentLayout: { h: number | null; w: number | null } | undefined;
      nodeHeight: number | null | undefined;
      nodeWidth: number | null | undefined;
    }> = [];
    const unsubscribe = getNodeInternalsStore(host).subscribe((state) => {
      const documentState = getWorkspaceDocumentStore(host).getState();
      observations.push({
        activeLayout:
          documentState.savedViews?.views["detail"]?.topLevelSections["alpha"],
        documentLayout: documentState.topLevelSections["alpha"],
        nodeHeight: state.x.get("alpha")?.height,
        nodeWidth: state.x.get("alpha")?.width,
      });
    });
    try {
      expect(activateWorkspaceSavedView(host, "detail")).toMatchObject({
        activeViewId: "detail",
        status: "applied",
      });
    } finally {
      unsubscribe();
    }

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      activeLayout: { h: 260, w: 480 },
      documentLayout: { h: 260, w: 480 },
      nodeHeight: 260,
      nodeWidth: 480,
    });
  });

  it("records keyboard moves in the active saved view and restores them", () => {
    const host = createHost(true);
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    activateWorkspaceSavedView(host, "overview");

    updatePositions(host, { isShiftPressed: false, x: 1, y: 0 });

    expect(getWorkspaceHistoryState(host).canUndo).toBe(true);
    expect(
      requireSavedViews(host).views["overview"]?.topLevelSections["alpha"]?.x,
    ).toBe(15);
    activateWorkspaceSavedView(host, "detail");
    expect(host.getSnapshot().topLevelSections["alpha"]?.x).toBe(0);
    activateWorkspaceSavedView(host, "overview");
    expect(host.getSnapshot().topLevelSections["alpha"]?.x).toBe(15);
  });

  it("persists focus stacking in the active saved view without structural history", () => {
    const host = createHost(true);
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    activateWorkspaceSavedView(host, "overview");

    applyActiveSectionChange(host, {
      interaction: "section-click",
      sectionId: "alpha",
    });

    const raisedZIndex = host.getSnapshot().topLevelSections["alpha"]?.zIndex;
    expect(raisedZIndex).toBeGreaterThan(
      host.getSnapshot().topLevelSections["beta"]?.zIndex ?? 0,
    );
    expect(
      requireSavedViews(host).views["overview"]?.topLevelSections["alpha"]
        ?.zIndex,
    ).toBe(raisedZIndex);
    expect(getWorkspaceHistoryState(host).canUndo).toBe(false);
    activateWorkspaceSavedView(host, "detail");
    expect(host.getSnapshot().topLevelSections["alpha"]?.zIndex).toBe(0);
    activateWorkspaceSavedView(host, "overview");
    expect(host.getSnapshot().topLevelSections["alpha"]?.zIndex).toBe(
      raisedZIndex,
    );
  });

  it("deletes active views through the successor and fallback activation boundary", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "middle", name: "Middle" });
    commitWorkspaceDocument(host, {
      ...host.getSnapshot(),
      topLevelSections: {
        ...host.getSnapshot().topLevelSections,
        alpha: { h: 100, w: 200, x: 300, y: 0, zIndex: 0 },
      },
    });
    activateWorkspaceSavedView(host, "overview");
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    commitWorkspaceDocument(host, {
      ...host.getSnapshot(),
      topLevelSections: {
        ...host.getSnapshot().topLevelSections,
        alpha: { h: 100, w: 200, x: 600, y: 0, zIndex: 0 },
      },
    });
    activateWorkspaceSavedView(host, "middle");

    expect(deleteWorkspaceSavedView(host, "middle")).toMatchObject({
      activeViewId: "detail",
      status: "applied",
    });
    expect(host.getSnapshot().topLevelSections["alpha"]?.x).toBe(600);
    expect(activateWorkspaceSavedView(host, "detail")).toMatchObject({
      status: "unchanged",
    });
    expect(deleteWorkspaceSavedView(host, "detail")).toMatchObject({
      activeViewId: "overview",
      status: "applied",
    });
    expect(host.getSnapshot().topLevelSections["alpha"]?.x).toBe(0);
  });

  it("publishes visibility once, prunes selection, and resets stale interaction state", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host);
    getWorkspaceMenuStateStore(host).setState({ invocation: {} as never });
    setActiveDnd(host, {
      activeId: "alpha",
      activeIsTopLevel: true,
      activeRect: null,
      height: null,
      width: null,
    });
    activateDndMovingFreeMode(host);
    let publications = 0;
    const unsubscribe = host.subscribe(() => {
      publications += 1;
    });
    try {
      expect(
        setWorkspaceSavedViewSectionVisibility(host, ["alpha"], false),
      ).toMatchObject({ status: "applied" });
    } finally {
      unsubscribe();
    }
    expect(publications).toBe(1);
    expect(host.getSnapshot().activeIds).toEqual(["beta"]);
    expect(getWorkspaceMenuStateStore(host).getState().invocation).toBeNull();
    expect(getDndStateStore(host).getState()).toMatchObject({
      activeId: null,
      isMovingFree: false,
    });
  });

  it("synchronizes direct live layout and viewport publications into only the active host", () => {
    const alpha = createHost();
    const beta = createHost();
    alpha.loadDocument(document());
    beta.loadDocument(document());
    enableWorkspaceSavedViews(alpha, { id: "alpha", name: "Alpha" });
    enableWorkspaceSavedViews(beta, { id: "beta", name: "Beta" });
    getWorkspaceDocumentStore(alpha).setState({
      topLevelSections: {
        ...getWorkspaceDocument(alpha).topLevelSections,
        alpha: { h: 100, w: 200, x: 360, y: 0, zIndex: 0 },
      },
      viewport: { x: 30, y: 60, zoom: 1.25 },
    });
    notifyWorkspaceDocumentChange(alpha, null);

    expect(
      requireSavedViews(alpha).views["alpha"]?.topLevelSections["alpha"]?.x,
    ).toBe(360);
    expect(requireSavedViews(alpha).views["alpha"]?.viewport).toEqual({
      x: 30,
      y: 60,
      zoom: 1.25,
    });
    expect(
      requireSavedViews(beta).views["beta"]?.topLevelSections["alpha"]?.x,
    ).toBe(0);
    expect(requireSavedViews(beta).views["beta"]?.viewport).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it("publishes a fitted camera once when activating a null-camera saved view", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    commitWorkspaceDocument(host, { ...host.getSnapshot(), viewport: null });
    activateWorkspaceSavedView(host, "overview");
    const { stopViewportSync, transforms } = mountFittedCanvas(host);
    const publications: Array<WorkspaceDocument> = [];
    const unsubscribe = host.subscribe((publication) => {
      publications.push(publication);
    });
    try {
      expect(activateWorkspaceSavedView(host, "detail")).toMatchObject({
        activeViewId: "detail",
        status: "applied",
      });
    } finally {
      unsubscribe();
      stopViewportSync();
    }

    expectOneFittedSavedViewPublication(publications, "detail", transforms);
  });

  it("publishes a fitted camera once when active deletion selects a null-camera successor", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host, { id: "overview", name: "Overview" });
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    commitWorkspaceDocument(host, { ...host.getSnapshot(), viewport: null });
    activateWorkspaceSavedView(host, "overview");
    const { stopViewportSync, transforms } = mountFittedCanvas(host);
    const publications: Array<WorkspaceDocument> = [];
    const unsubscribe = host.subscribe((publication) => {
      publications.push(publication);
    });
    try {
      expect(deleteWorkspaceSavedView(host, "overview")).toMatchObject({
        activeViewId: "detail",
        status: "applied",
      });
    } finally {
      unsubscribe();
      stopViewportSync();
    }

    expectOneFittedSavedViewPublication(publications, "detail", transforms);
  });

  it("reconciles section drift and exposes a bootstrap projection for persisted active views", () => {
    const source = document();
    const savedViews = createWorkspaceSavedViewsState(source, {
      id: "overview",
      name: "Overview",
    });
    const savedView = savedViews.views["overview"];
    if (!savedView) {
      throw new Error("Expected an overview view.");
    }
    const persisted = {
      activeViewId: "overview",
      views: {
        overview: {
          ...savedView,
          sectionVisibility: { ...savedView.sectionVisibility, alpha: false },
          topLevelSections: {
            ...savedView.topLevelSections,
            alpha: { h: 100, w: 200, x: 700, y: 0, zIndex: 0 },
          },
          viewport: { x: 90, y: 20, zoom: 2 },
        },
      },
    };
    const projected = projectWorkspaceDocumentSavedViews({
      ...source,
      activeIds: ["alpha", "beta"],
      savedViews: persisted,
    });
    expect(projected.topLevelSections["alpha"]?.x).toBe(700);
    expect(projected.viewport).toEqual({ x: 90, y: 20, zoom: 2 });
    expect(projected.activeIds).toEqual(["beta"]);

    const host = createHost();
    host.loadDocument(projected);
    host.loadDocument({
      ...host.getSnapshot(),
      activeIds: [],
      sections: {
        alpha: section("alpha"),
        gamma: section("gamma"),
      },
      topLevelSections: {
        alpha: { h: 100, w: 200, x: 700, y: 0, zIndex: 0 },
        gamma: { h: 100, w: 200, x: 960, y: 0, zIndex: 1 },
      },
    });
    const reconciled = requireSavedViews(host).views["overview"];
    expect(reconciled?.sectionVisibility).toEqual({
      alpha: false,
      gamma: true,
    });
    expect(reconciled?.topLevelSections["gamma"]).toEqual({
      h: 100,
      w: 200,
      x: 960,
      y: 0,
      zIndex: 1,
    });
  });

  it("reports capability availability while allowing activation without layout editing", () => {
    const host = createHost();
    host.loadDocument(document());
    enableWorkspaceSavedViews(host);
    createWorkspaceSavedView(host, { id: "detail", name: "Detail" });
    getWorkspaceCapabilitiesStore(host).setState({ canEditLayout: false });

    expect(getWorkspaceSavedViewsOperationDisabledReason(host, "create")).toBe(
      "Editing saved views requires permission to edit workspace layout.",
    );
    expect(createWorkspaceSavedView(host)).toMatchObject({
      status: "unavailable",
    });
    expect(activateWorkspaceSavedView(host, "view-1")).toMatchObject({
      activeViewId: "view-1",
      status: "applied",
    });
    expect(() =>
      getWorkspaceSavedViewsOperationDisabledReason(host, "unknown" as never),
    ).toThrow(/Unknown saved views operation/u);
    expect(() => activateWorkspaceSavedView(host, "constructor")).toThrow(
      /reserved id/u,
    );
  });
});
