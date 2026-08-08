import {
  WORKSPACE_DOCUMENT_VERSION,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "./core.js";

export * from "./internal/collision-characterization.js";
export * from "./internal/geometry-index.js";
export * from "./internal/interaction-geometry.js";
export * from "./internal/interaction-owner.js";
export * from "./internal/section-move-planning.js";
export * from "./internal/selection-planning.js";
export * from "./internal/sorting-preview.js";
export * from "./internal/transient-root-projection.js";
export * from "./internal/upstream-adapter-proof.js";
export * from "./internal/upstream-dnd-adapter.js";

export function createWorkspaceTestDocument(
  sections: readonly WorkspaceSection[],
): WorkspaceDocument {
  return {
    version: WORKSPACE_DOCUMENT_VERSION,
    rootSectionIds: sections.map((section) => section.id),
    sections: Object.fromEntries(sections.map((section) => [section.id, section])),
  };
}
