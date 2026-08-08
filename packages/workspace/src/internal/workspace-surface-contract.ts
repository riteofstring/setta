import type {
  WorkspaceDocument,
  WorkspaceJsonValue,
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
  "layout-edit-disabled" | "presentation-edit-disabled" | "structure-edit-disabled";

export type WorkspaceActionResult =
  | Readonly<{ status: "applied" | "unchanged" }>
  | Readonly<{ reason: WorkspaceActionRejectionReason; status: "rejected" }>;

export type WorkspaceFitOptions = Readonly<{
  padding?: number;
}>;

export type WorkspaceDocumentChangeReason =
  "section-delete" | "section-lock" | "section-minimize" | "viewport";

export type WorkspaceDocumentChange = Readonly<{
  reason: WorkspaceDocumentChangeReason;
}>;

export type WorkspaceController<TSectionData = WorkspaceJsonValue> = Readonly<{
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
  setSectionMinimized(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
  setSectionsLocked(sectionIds: readonly string[], locked: boolean): WorkspaceActionResult;
  setViewport(viewport: WorkspaceViewport): WorkspaceActionResult;
}>;
