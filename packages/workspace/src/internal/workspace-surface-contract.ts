import type {
  WorkspaceDocument,
  WorkspaceJsonValue,
  WorkspacePoint,
  WorkspaceSectionPresentation,
  WorkspaceViewport,
} from "./workspace-document-contract.js";
import type { WorkspaceCapabilities } from "./workspace-policy.js";

export type WorkspaceGridPattern = "cross" | "dots" | "lines";

export type WorkspaceGridOptions = Readonly<{
  markSize?: number;
  pattern?: WorkspaceGridPattern;
  snap: boolean;
  spacing: readonly [x: number, y: number];
  visible: boolean;
}>;

export type WorkspaceGridOptionOverrides = Partial<WorkspaceGridOptions>;
export type WorkspaceAppearance = "dark" | "light" | "system";

export type WorkspaceThemeTokens = Readonly<{
  canvasBackground: string;
  focus: string;
  gridColor: string;
  invalid: string;
  minimapBackground: string;
  sectionBackground: string;
  sectionMutedText: string;
  sectionText: string;
  selection: string;
  toolbarBackground: string;
}>;

export type WorkspaceAppearanceOptions = Readonly<{
  appearance: WorkspaceAppearance;
  dark?: Partial<WorkspaceThemeTokens>;
  light?: Partial<WorkspaceThemeTokens>;
}>;

export type WorkspaceAppearanceOptionOverrides = Partial<WorkspaceAppearanceOptions>;

export type WorkspaceActionRejectionReason =
  | "canvas-unavailable"
  | "group-kind-cannot-contain-sections"
  | "group-selection-too-small"
  | "grouping-unavailable"
  | "layout-edit-disabled"
  | "mixed-parent-selection"
  | "presentation-edit-disabled"
  | "section-creation-unavailable"
  | "section-geometry-unavailable"
  | "section-id-exists"
  | "section-locked"
  | "section-minimized"
  | "section-not-minimizable"
  | "section-not-container"
  | "section-not-root"
  | "structure-edit-disabled"
  | "unknown-section-kind";

export type WorkspaceActionResult =
  | Readonly<{ status: "applied" | "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

export type WorkspaceFitOptions = Readonly<{
  padding?: number;
}>;

export type WorkspaceCreateSectionOptions = Readonly<{
  position?: WorkspacePoint;
}>;

export type WorkspaceDocumentChangeReason =
  | "history-redo"
  | "history-undo"
  | "section-create"
  | "section-delete"
  | "section-group"
  | "section-lock"
  | "section-minimize"
  | "section-move"
  | "section-presentation"
  | "section-resize"
  | "section-size-mode"
  | "section-stack"
  | "section-title"
  | "section-ungroup"
  | "viewport";

export type WorkspaceDocumentChange = Readonly<{
  reason: WorkspaceDocumentChangeReason;
}>;

export type WorkspaceHistoryState = Readonly<{
  canRedo: boolean;
  canUndo: boolean;
}>;

export type WorkspaceController<TSectionData = WorkspaceJsonValue> = Readonly<{
  bringForward(sectionIds: readonly string[]): WorkspaceActionResult;
  bringToFront(sectionIds: readonly string[]): WorkspaceActionResult;
  clearSelection(): WorkspaceActionResult;
  createSection(kind: string, options?: WorkspaceCreateSectionOptions): WorkspaceActionResult;
  deleteSections(sectionIds: readonly string[]): WorkspaceActionResult;
  fitSection(sectionId: string, options?: WorkspaceFitOptions): Promise<WorkspaceActionResult>;
  fitSections(
    sectionIds: readonly string[],
    options?: WorkspaceFitOptions,
  ): Promise<WorkspaceActionResult>;
  groupSections(sectionIds: readonly string[]): WorkspaceActionResult;
  focusNextSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusPreviousSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusSection(sectionId: string): Promise<WorkspaceActionResult>;
  getCapabilities(): WorkspaceCapabilities;
  getDocument(): WorkspaceDocument<TSectionData>;
  getHistoryState(): WorkspaceHistoryState;
  getSelectedSectionIds(): readonly string[];
  redo(): WorkspaceActionResult;
  selectSections(sectionIds: readonly string[]): WorkspaceActionResult;
  sendBackward(sectionIds: readonly string[]): WorkspaceActionResult;
  sendToBack(sectionIds: readonly string[]): WorkspaceActionResult;
  setSectionMinimized(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  setSectionPresentation(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  setSectionTitle(sectionId: string, title: string): WorkspaceActionResult;
  setSectionsLocked(sectionIds: readonly string[], locked: boolean): WorkspaceActionResult;
  setViewport(viewport: WorkspaceViewport): WorkspaceActionResult;
  undo(): WorkspaceActionResult;
  ungroupSection(sectionId: string): WorkspaceActionResult;
}>;
