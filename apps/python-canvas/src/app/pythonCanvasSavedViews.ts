import {
  createWorkspaceSavedViewsState,
  projectWorkspaceDocumentSavedViews,
  type WorkspaceDocument,
  type WorkspaceDocumentInput,
  type WorkspaceSavedViewsState,
} from "@setta/workspace";

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

export function bootstrapPythonCanvasSavedViews(
  document: WorkspaceDocumentInput,
  projectId: string,
): PythonCanvasSavedViewsBootstrap {
  const loaded = loadPythonCanvasSavedViews(projectId);
  const savedViews =
    loaded.kind === "loaded"
      ? loaded.savedViews
      : createWorkspaceSavedViewsState(document, {
          id: "overview",
          name: "Overview",
        });
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
  let persistedSavedViews: WorkspaceSavedViewsState | null = null;
  return {
    beginInitialLoad: (document) => {
      persistedSavedViews = document.savedViews;
      isLoadingInitialSavedViews = true;
    },
    completeInitialLoad: (document) => {
      persistedSavedViews = document.savedViews;
      isLoadingInitialSavedViews = false;
    },
    persist: (document) => {
      const savedViews = document.savedViews;
      const currentProjectId = projectId();
      if (isLoadingInitialSavedViews) {
        persistedSavedViews = savedViews;
        return;
      }
      if (
        savedViews === null ||
        currentProjectId === null ||
        savedViews === persistedSavedViews
      ) {
        return;
      }
      const result = persistPythonCanvasSavedViews(
        currentProjectId,
        savedViews,
      );
      if (result.kind === "persisted") {
        persistedSavedViews = savedViews;
        return;
      }
      reportFailure();
    },
  };
}
