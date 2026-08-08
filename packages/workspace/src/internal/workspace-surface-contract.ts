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
  | "layout-edit-disabled"
  | "presentation-edit-disabled"
  | "section-creation-unavailable"
  | "section-id-exists"
  | "section-locked"
  | "section-not-minimizable"
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
  | "section-create"
  | "section-delete"
  | "section-lock"
  | "section-minimize"
  | "section-move"
  | "section-presentation"
  | "section-title"
  | "viewport";

export type WorkspaceDocumentChange = Readonly<{
  reason: WorkspaceDocumentChangeReason;
}>;

export type WorkspaceController<TSectionData = WorkspaceJsonValue> = Readonly<{
  clearSelection(): WorkspaceActionResult;
  createSection(kind: string, options?: WorkspaceCreateSectionOptions): WorkspaceActionResult;
  deleteSections(sectionIds: readonly string[]): WorkspaceActionResult;
  fitSection(sectionId: string, options?: WorkspaceFitOptions): Promise<WorkspaceActionResult>;
  fitSections(
    sectionIds: readonly string[],
    options?: WorkspaceFitOptions,
  ): Promise<WorkspaceActionResult>;
  focusNextSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusPreviousSection(sectionId: string): Promise<WorkspaceActionResult>;
  focusSection(sectionId: string): Promise<WorkspaceActionResult>;
  getCapabilities(): WorkspaceCapabilities;
  getDocument(): WorkspaceDocument<TSectionData>;
  getSelectedSectionIds(): readonly string[];
  selectSections(sectionIds: readonly string[]): WorkspaceActionResult;
  setSectionMinimized(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  setSectionPresentation(
    sectionId: string,
    presentation: WorkspaceSectionPresentation,
  ): WorkspaceActionResult;
  setSectionTitle(sectionId: string, title: string): WorkspaceActionResult;
  setSectionsLocked(sectionIds: readonly string[], locked: boolean): WorkspaceActionResult;
  setViewport(viewport: WorkspaceViewport): WorkspaceActionResult;
}>;
