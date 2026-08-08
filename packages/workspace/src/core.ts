export const WORKSPACE_DOCUMENT_VERSION = 1 as const;

export type WorkspaceSection = {
  id: string;
  title: string;
};

export type WorkspaceDocument = {
  version: typeof WORKSPACE_DOCUMENT_VERSION;
  rootSectionIds: readonly string[];
  sections: Readonly<Record<string, WorkspaceSection>>;
};

export function createEmptyWorkspaceDocument(): WorkspaceDocument {
  return {
    version: WORKSPACE_DOCUMENT_VERSION,
    rootSectionIds: [],
    sections: {},
  };
}
