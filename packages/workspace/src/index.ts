// Provisional Phase 1 surface. The ratified public API is a post-parity decision; these exports
// exist so the playground can render the extracted chrome and canvas, and they may change freely.
export { applyActiveSectionChange } from "./canvas/activeSectionController";
export { useWorkspaceOptions } from "./canvas/options";
export type { WorkspaceInteractionOptions } from "./canvas/options";
export { useViewportInteractionActive } from "./canvas/useViewportInteractionActive";
export { WorkspaceCanvas } from "./canvas/WorkspaceCanvas";
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
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "./interaction";
export {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./section/sectionChrome";
export { getOnSectionClick } from "./section/sectionClick";
export { DEFAULT_SECTION_BG_COLOR } from "./section/sectionColors";
export { deriveSectionStyleTheme } from "./section/sectionStyleColors";
export { resolveSectionStyleVars } from "./section/sectionStyleVars";
export type { SectionStyleVars } from "./section/sectionStyleVars";
