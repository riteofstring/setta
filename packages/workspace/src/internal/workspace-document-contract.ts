export const WORKSPACE_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type WorkspaceJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly WorkspaceJsonValue[]
  | { readonly [key: string]: WorkspaceJsonValue };

export type WorkspacePoint = Readonly<{
  x: number;
  y: number;
}>;

export type WorkspaceViewport = WorkspacePoint &
  Readonly<{
    zoom: number;
  }>;

export type SectionOrientation = "horizontal" | "vertical";
export type SectionOverflow = "grow" | "scroll";
export type SectionChrome = "compact" | "default" | "none" | "transparent";
export type SectionDimensionMode = "content" | "fixed";
export type SectionChildPositioning = "freeform" | "ordered";

export type SectionDimension = Readonly<{
  mode: SectionDimensionMode;
  value: number;
}>;

export type WorkspaceSectionSize = Readonly<{
  height: SectionDimension;
  width: SectionDimension;
}>;

export type WorkspaceSectionPresentation = Readonly<{
  accentColor: string | null;
  chrome: SectionChrome;
  tagColor: string | null;
}>;

export type WorkspaceOrderedChildLayout = Readonly<{
  orientation: SectionOrientation;
  overflow: SectionOverflow;
  positioning: "ordered";
  sectionIds: readonly string[];
}>;

export type WorkspaceFreeformChildLayout = Readonly<{
  overflow: SectionOverflow;
  positioning: "freeform";
  positions: Readonly<Record<string, WorkspacePoint>>;
  sectionIds: readonly string[];
}>;

export type WorkspaceChildLayout = WorkspaceFreeformChildLayout | WorkspaceOrderedChildLayout;

export type WorkspaceChildLayoutPositioningChange =
  | Readonly<{
      orientation: SectionOrientation;
      positioning: "ordered";
    }>
  | Readonly<{
      positioning: "freeform";
      positions: Readonly<Record<string, WorkspacePoint>>;
    }>;

export type WorkspaceSection<TSectionData = WorkspaceJsonValue> = Readonly<{
  childLayout: WorkspaceChildLayout | null;
  data: TSectionData;
  id: string;
  isMinimized: boolean;
  kind: string;
  positionAndSizeLocked: boolean;
  presentation: WorkspaceSectionPresentation;
  size: WorkspaceSectionSize;
  title: string;
}>;

export type WorkspaceRootSection = Readonly<{
  position: WorkspacePoint;
  sectionId: string;
}>;

export type WorkspaceDocument<TSectionData = WorkspaceJsonValue> = Readonly<{
  rootSections: readonly WorkspaceRootSection[];
  schemaVersion: typeof WORKSPACE_DOCUMENT_SCHEMA_VERSION;
  sections: Readonly<Record<string, WorkspaceSection<TSectionData>>>;
  viewport: WorkspaceViewport;
}>;

export type WorkspaceParentLookup = ReadonlyMap<string, string | null>;
