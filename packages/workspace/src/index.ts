// Provisional Phase 1 surface. The ratified public API is a post-parity decision; these exports
// exist so the playground can drive the extracted slice, and they may change freely.
export { useWorkspaceOptions } from "./canvas/options";
export type { WorkspaceGridPattern, WorkspaceInteractionOptions } from "./canvas/options";
// These two string unions appear in WorkspaceInteractionOptions; riding the index keeps
// consumers off deep canvas-internal import paths.
export type { PanOnScrollMode, SelectionMode } from "./canvas/types";
export { WorkspaceCanvas } from "./canvas/WorkspaceCanvas";
export { useWorkspaceCapabilities } from "./document/capabilities";
export type { WorkspaceCapabilitiesState } from "./document/capabilities";
export {
  getWorkspaceDocument,
  setWorkspaceDocumentChangeCallback,
} from "./document/documentChangeCallback";
export type { WorkspaceDocumentChangeCallback } from "./document/documentChangeCallback";
export { GROUP_SECTION_KIND } from "./document/documentSelectors";
export { loadWorkspaceDocument } from "./document/loadWorkspaceDocument";
export { useWorkspaceAppearance } from "./document/stores";
export type { WorkspaceAppearanceState } from "./document/stores";
export type {
  Position,
  SectionSize,
  SectionSizeValue,
  TopLevelSectionLayout,
  Viewport,
  WorkspaceDocument,
  WorkspaceSection,
} from "./document/types";
export {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "./interaction";
export { WorkspaceControls } from "./toolbar/WorkspaceControls";
export { WorkspaceTooltip } from "./tooltip/WorkspaceTooltip";
