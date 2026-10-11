import {
  createWorkspaceSavedViewsState,
  parseWorkspaceSavedViewsState,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
} from "@riteofstring/setta";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forestMutationProposal } from "./pythonCanvasAppSupport";
import { callableSnapshot } from "./pythonCanvasAppTestFixtures";
import {
  callableSectionID,
  projectWorkspaceDocument,
} from "./workspaceProjection";

const mocks = vi.hoisted(() => ({
  loadPythonCanvasSavedViews: vi.fn(),
  persistPythonCanvasSavedViews: vi.fn(),
}));

vi.mock("./pythonCanvasSavedViewsPreferences", () => ({
  loadPythonCanvasSavedViews: mocks.loadPythonCanvasSavedViews,
  persistPythonCanvasSavedViews: mocks.persistPythonCanvasSavedViews,
}));

import {
  bootstrapPythonCanvasSavedViews,
  createPythonCanvasSavedViewsPersistence,
} from "./pythonCanvasSavedViews";

function emptyDocument(): WorkspaceDocumentInput {
  return {
    activeIds: [],
    savedViews: null,
    sections: {},
    topLevelSections: {},
    viewport: null,
  };
}

function requireSavedViews(document: WorkspaceDocument) {
  if (document.savedViews === null) {
    throw new Error("Expected saved views.");
  }
  return document.savedViews;
}

describe("Python Canvas saved views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds Overview and preserves a loaded active viewport before host load", () => {
    mocks.loadPythonCanvasSavedViews.mockReturnValueOnce({ kind: "missing" });

    const seeded = bootstrapPythonCanvasSavedViews(
      emptyDocument(),
      "project:one",
    );

    expect(seeded.storageIssue).toBeNull();
    expect(seeded.document.savedViews).toMatchObject({
      activeViewId: "overview",
      views: { overview: { name: "Overview" } },
    });

    const loadedSavedViews = createWorkspaceSavedViewsState(emptyDocument(), {
      id: "overview",
      name: "Overview",
    });
    const loadedOverview = loadedSavedViews.views.overview;
    if (loadedOverview === undefined) {
      throw new Error("Expected Overview.");
    }
    mocks.loadPythonCanvasSavedViews.mockReturnValueOnce({
      kind: "loaded",
      savedViews: {
        ...loadedSavedViews,
        views: {
          overview: {
            ...loadedOverview,
            viewport: { x: 120, y: 80, zoom: 1.25 },
          },
        },
      },
    });

    expect(
      bootstrapPythonCanvasSavedViews(emptyDocument(), "project:one").document
        .viewport,
    ).toEqual({ x: 120, y: 80, zoom: 1.25 });
  });

  it("persists accepted view changes after initial loading and reports write failures", () => {
    mocks.persistPythonCanvasSavedViews.mockReturnValueOnce({
      kind: "persisted",
    });
    mocks.persistPythonCanvasSavedViews.mockReturnValueOnce({
      kind: "unavailable",
    });
    const document = emptyDocument();
    const savedViews = createWorkspaceSavedViewsState(document, {
      id: "overview",
      name: "Overview",
    });
    const completeDocument = { ...document, savedViews } as WorkspaceDocument;
    const reportFailure = vi.fn();
    const persistence = createPythonCanvasSavedViewsPersistence({
      projectId: () => "project:one",
      reportFailure,
    });
    persistence.beginInitialLoad(completeDocument);
    persistence.persist(completeDocument);
    persistence.completeInitialLoad(completeDocument);
    const overview = requireSavedViews(completeDocument).views.overview;
    if (overview === undefined) {
      throw new Error("Expected Overview.");
    }
    const firstUpdate = {
      ...completeDocument,
      savedViews: {
        ...savedViews,
        views: {
          ...savedViews.views,
          overview: { ...overview, viewport: { x: 24, y: 16, zoom: 1 } },
        },
      },
    };

    persistence.persist(firstUpdate);
    expect(mocks.persistPythonCanvasSavedViews).toHaveBeenCalledWith(
      "project:one",
      firstUpdate.savedViews,
    );
    const secondUpdate = {
      ...firstUpdate,
      savedViews: {
        ...firstUpdate.savedViews!,
        views: {
          ...firstUpdate.savedViews!.views,
          overview: {
            ...firstUpdate.savedViews!.views.overview!,
            viewport: { x: 48, y: 32, zoom: 1 },
          },
        },
      },
    };

    persistence.persist(secondUpdate);
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("does not repeat a failed write for unchanged saved views and retries changed views", () => {
    mocks.persistPythonCanvasSavedViews
      .mockReturnValueOnce({ kind: "unavailable" })
      .mockReturnValueOnce({ kind: "persisted" });
    const document = emptyDocument();
    const savedViews = createWorkspaceSavedViewsState(document, {
      id: "overview",
      name: "Overview",
    });
    const completeDocument = { ...document, savedViews } as WorkspaceDocument;
    const reportFailure = vi.fn();
    const persistence = createPythonCanvasSavedViewsPersistence({
      projectId: () => "project:one",
      reportFailure,
    });
    persistence.beginInitialLoad(completeDocument);
    persistence.completeInitialLoad(completeDocument);
    const overview = requireSavedViews(completeDocument).views.overview;
    if (overview === undefined) {
      throw new Error("Expected Overview.");
    }
    const failedUpdate = {
      ...completeDocument,
      savedViews: {
        ...savedViews,
        views: {
          ...savedViews.views,
          overview: { ...overview, viewport: { x: 24, y: 16, zoom: 1 } },
        },
      },
    };

    persistence.persist(failedUpdate);
    persistence.persist({ ...failedUpdate, viewport: { x: 4, y: 8, zoom: 1 } });

    expect(mocks.persistPythonCanvasSavedViews).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledOnce();
    const changedUpdate = {
      ...failedUpdate,
      savedViews: {
        ...failedUpdate.savedViews,
        views: {
          ...failedUpdate.savedViews.views,
          overview: {
            ...failedUpdate.savedViews.views.overview,
            viewport: { x: 48, y: 32, zoom: 1 },
          },
        },
      },
    };

    persistence.persist(changedUpdate);

    expect(mocks.persistPythonCanvasSavedViews).toHaveBeenCalledTimes(2);
    expect(mocks.persistPythonCanvasSavedViews).toHaveBeenLastCalledWith(
      "project:one",
      changedUpdate.savedViews,
    );
    expect(reportFailure).toHaveBeenCalledOnce();
  });

  it("deduplicates semantically unchanged saved views after a backend projection", () => {
    const document = emptyDocument();
    const savedViews = createWorkspaceSavedViewsState(document, {
      id: "overview",
      name: "Overview",
    });
    const completeDocument = { ...document, savedViews } as WorkspaceDocument;
    const persistence = createPythonCanvasSavedViewsPersistence({
      projectId: () => "project:one",
      reportFailure: vi.fn(),
    });
    persistence.beginInitialLoad(completeDocument);
    persistence.completeInitialLoad(completeDocument);
    const reprojected = {
      ...completeDocument,
      savedViews: parseWorkspaceSavedViewsState(
        JSON.parse(JSON.stringify(savedViews)),
      ),
    } as WorkspaceDocument;

    expect(reprojected.savedViews).not.toBe(savedViews);
    persistence.persist(reprojected);

    expect(mocks.persistPythonCanvasSavedViews).not.toHaveBeenCalled();
  });

  it("keeps active saved-view stacking outside backend forest proposals", () => {
    const initialSnapshot = callableSnapshot(1, []);
    const snapshot = {
      ...initialSnapshot,
      callables: [
        ...initialSnapshot.callables,
        {
          authoredExpression: "second",
          id: "callable:two",
          name: "Two callable",
          parameters: [],
        },
      ],
      topLevelSectionIds: ["callable:one", "callable:two"],
    };
    const document = projectWorkspaceDocument(snapshot);
    const firstSectionId = callableSectionID("callable:one");
    const secondSectionId = callableSectionID("callable:two");
    const savedViews = createWorkspaceSavedViewsState(document, {
      id: "overview",
      name: "Overview",
    });
    const overview = savedViews.views.overview;
    if (overview === undefined) {
      throw new Error("Expected Overview.");
    }
    const firstLayout = overview.topLevelSections[firstSectionId];
    const secondLayout = overview.topLevelSections[secondSectionId];
    if (firstLayout === undefined || secondLayout === undefined) {
      throw new Error("Expected Overview top-level layouts.");
    }
    const viewOnlyDocument = {
      ...document,
      activeIds: [secondSectionId],
      topLevelSections: {
        ...document.topLevelSections,
        [firstSectionId]: {
          ...document.topLevelSections[firstSectionId]!,
          zIndex: 1,
        },
        [secondSectionId]: {
          ...document.topLevelSections[secondSectionId]!,
          zIndex: 0,
        },
      },
      savedViews: {
        ...savedViews,
        views: {
          ...savedViews.views,
          overview: {
            ...overview,
            topLevelSections: {
              ...overview.topLevelSections,
              [firstSectionId]: { ...firstLayout, zIndex: 1 },
              [secondSectionId]: { ...secondLayout, zIndex: 0 },
            },
            viewport: { x: 12, y: 8, zoom: 1 },
          },
        },
      },
    };

    expect(forestMutationProposal(viewOnlyDocument, snapshot)).toBeNull();
  });
});
