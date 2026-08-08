export { WORKSPACE_DOCUMENT_SCHEMA_VERSION } from "./internal/workspace-document-contract.js";
export type {
  SectionChrome,
  SectionDimension,
  SectionDimensionMode,
  SectionOrientation,
  SectionOverflow,
  WorkspaceChildLayout,
  WorkspaceDocument,
  WorkspaceJsonValue,
  WorkspaceParentLookup,
  WorkspacePoint,
  WorkspaceRootSection,
  WorkspaceSection,
  WorkspaceSectionPresentation,
  WorkspaceSectionSize,
  WorkspaceViewport,
} from "./internal/workspace-document-contract.js";
export {
  WorkspaceDocumentValidationError,
  isValidWorkspaceColor,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  validateWorkspaceDocument,
} from "./internal/workspace-document-validation.js";
export type { WorkspaceDocumentValidationCode } from "./internal/workspace-document-validation.js";
export {
  createEmptyWorkspaceDocument,
  deriveWorkspaceParentLookup,
  getAdjacentWorkspaceSectionId,
  getWorkspaceNavigationOrder,
  getWorkspaceSectionOrder,
  isWorkspaceSectionDescendant,
} from "./internal/workspace-document.js";
export {
  WORKSPACE_DEFAULT_CAPABILITIES,
  WORKSPACE_DEFAULT_GESTURE_OPTIONS,
  WORKSPACE_DEFAULT_ZOOM,
  WORKSPACE_MAX_ZOOM,
  WORKSPACE_MIN_ZOOM,
  resolveWorkspaceCapabilities,
  resolveWorkspaceGestureOptions,
} from "./internal/workspace-policy.js";
export type {
  WorkspaceActivationKey,
  WorkspaceCapabilities,
  WorkspaceCapabilityOverrides,
  WorkspaceGestureOptionOverrides,
  WorkspaceGestureOptions,
  WorkspacePanOnScrollMode,
} from "./internal/workspace-policy.js";
export type {
  WorkspaceActionRejectionReason,
  WorkspaceActionResult,
  WorkspaceAppearance,
  WorkspaceAppearanceOptionOverrides,
  WorkspaceAppearanceOptions,
  WorkspaceController,
  WorkspaceDocumentChange,
  WorkspaceDocumentChangeReason,
  WorkspaceFitOptions,
  WorkspaceGridOptionOverrides,
  WorkspaceGridOptions,
  WorkspaceGridPattern,
  WorkspaceThemeTokens,
} from "./internal/workspace-surface-contract.js";
