import {
  createWorkspaceSavedViewsState,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
} from "@setta/workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forestMutationProposal } from "./pythonCanvasAppSupport";
import { callableSnapshot } from "./pythonCanvasAppTestFixtures";
import { projectWorkspaceDocument } from "./workspaceProjection";

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

  it("keeps saved-view-only changes outside backend forest proposals", () => {
    const snapshot = callableSnapshot(1, []);
    const document = projectWorkspaceDocument(snapshot);
    const savedViews = createWorkspaceSavedViewsState(document, {
      id: "overview",
      name: "Overview",
    });
    const overview = savedViews.views.overview;
    if (overview === undefined) {
      throw new Error("Expected Overview.");
    }
    const viewOnlyDocument = {
      ...document,
      savedViews: {
        ...savedViews,
        views: {
          ...savedViews.views,
          overview: { ...overview, viewport: { x: 12, y: 8, zoom: 1 } },
        },
      },
    };

    expect(forestMutationProposal(viewOnlyDocument, snapshot)).toBeNull();
  });
});
