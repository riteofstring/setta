import {
  createWorkspaceSavedViewsState,
  projectWorkspaceDocumentSavedViews,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
  type WorkspaceSavedViewsState,
} from "@riteofstring/setta";

import {
  loadPythonCanvasSavedViews,
  persistPythonCanvasSavedViews,
} from "./pythonCanvasSavedViewsPreferences";

type PythonCanvasSavedViewsBootstrap = {
  document: WorkspaceDocumentInput;
  storageIssue: "malformed" | "unavailable" | null;
};

type PythonCanvasSavedViewsPersistenceOptions = {
  projectId: () => string | null;
  reportFailure: () => void;
};

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function getSavedViewsPersistenceSignature(
  savedViews: WorkspaceSavedViewsState | null,
): string | null {
  if (savedViews === null) {
    return null;
  }
  const signature = JSON.stringify([
    savedViews.activeViewId,
    Object.values(savedViews.views)
      .sort((left, right) => compareStrings(left.id, right.id))
      .map((view) => [
        view.id,
        view.name,
        view.sortIndex,
        Object.entries(view.topLevelSections)
          .sort(([left], [right]) => compareStrings(left, right))
          .map(([sectionId, layout]) => [
            sectionId,
            layout.x,
            layout.y,
            layout.w,
            layout.h,
            layout.zIndex,
          ]),
        view.viewport === null
          ? null
          : [view.viewport.x, view.viewport.y, view.viewport.zoom],
        Object.entries(view.sectionVisibility).sort(([left], [right]) =>
          compareStrings(left, right),
        ),
      ]),
  ]);
  if (signature === undefined) {
    throw new Error("Saved views persistence state is not serializable.");
  }
  return signature;
}

export function bootstrapPythonCanvasSavedViews(
  document: WorkspaceDocumentInput,
  projectId: string,
): PythonCanvasSavedViewsBootstrap {
  const loaded = loadPythonCanvasSavedViews(projectId);
  const savedViews =
    loaded.kind === "loaded"
      ? loaded.savedViews
      : (document.savedViews ??
        createWorkspaceSavedViewsState(document, {
          id: "overview",
          name: "Overview",
        }));
  return {
    document: projectWorkspaceDocumentSavedViews({
      ...document,
      savedViews,
    }),
    storageIssue:
      loaded.kind === "malformed" || loaded.kind === "unavailable"
        ? loaded.kind
        : null,
  };
}

export function createPythonCanvasSavedViewsPersistence({
  projectId,
  reportFailure,
}: PythonCanvasSavedViewsPersistenceOptions): {
  beginInitialLoad: (document: WorkspaceDocumentInput) => void;
  completeInitialLoad: (document: WorkspaceDocument) => void;
  persist: (document: WorkspaceDocument) => void;
} {
  let isLoadingInitialSavedViews = false;
  let lastAttemptedSavedViewsSignature: string | null = null;
  let persistedSavedViewsSignature: string | null = null;
  return {
    beginInitialLoad: (document) => {
      const savedViewsSignature = getSavedViewsPersistenceSignature(
        document.savedViews,
      );
      lastAttemptedSavedViewsSignature = savedViewsSignature;
      persistedSavedViewsSignature = savedViewsSignature;
      isLoadingInitialSavedViews = true;
    },
    completeInitialLoad: (document) => {
      const savedViewsSignature = getSavedViewsPersistenceSignature(
        document.savedViews,
      );
      lastAttemptedSavedViewsSignature = savedViewsSignature;
      persistedSavedViewsSignature = savedViewsSignature;
      isLoadingInitialSavedViews = false;
    },
    persist: (document) => {
      const savedViews = document.savedViews;
      const currentProjectId = projectId();
      const savedViewsSignature = getSavedViewsPersistenceSignature(savedViews);
      if (isLoadingInitialSavedViews) {
        lastAttemptedSavedViewsSignature = savedViewsSignature;
        persistedSavedViewsSignature = savedViewsSignature;
        return;
      }
      if (
        savedViews === null ||
        currentProjectId === null ||
        savedViewsSignature === persistedSavedViewsSignature ||
        savedViewsSignature === lastAttemptedSavedViewsSignature
      ) {
        return;
      }
      lastAttemptedSavedViewsSignature = savedViewsSignature;
      const result = persistPythonCanvasSavedViews(
        currentProjectId,
        savedViews,
      );
      if (result.kind === "persisted") {
        persistedSavedViewsSignature = savedViewsSignature;
        return;
      }
      reportFailure();
    },
  };
}
