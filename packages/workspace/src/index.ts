// Provisional Phase 1 surface. The ratified public API is a post-parity decision; these exports
// exist so the playground can render the extracted chrome, and they may change freely.
export { resolveActiveSectionChange } from "./document/activeSectionPolicy";
export type {
  ActiveSectionPolicyContext,
  ActiveSectionPolicyResult,
} from "./document/activeSectionPolicy";
export { getActiveSectionIds, setActiveSectionIds } from "./document/activeSections";
export { getHighestAncestor } from "./document/documentSelectors";
export { loadWorkspaceDocument } from "./document/loadWorkspaceDocument";
export type { WorkspaceDocument } from "./document/loadWorkspaceDocument";
export { setZIndices } from "./document/sectionZIndices";
export {
  useActiveSections,
  useNodeInternals,
  useWorkspaceAppearance,
  useWorkspaceDocument,
} from "./document/stores";
export type {
  ActiveSectionsState,
  NodeInternalsState,
  WorkspaceAppearanceState,
  WorkspaceDocumentState,
} from "./document/stores";
export type {
  Node,
  Position,
  SectionSize,
  SectionSizeValue,
  TopLevelSectionLayout,
  Viewport,
  WorkspaceSection,
} from "./document/types";
export {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./section/sectionChrome";
export { DEFAULT_SECTION_BG_COLOR } from "./section/sectionColors";
export { deriveSectionStyleTheme } from "./section/sectionStyleColors";
export { resolveSectionStyleVars } from "./section/sectionStyleVars";
export type { SectionStyleVars } from "./section/sectionStyleVars";
