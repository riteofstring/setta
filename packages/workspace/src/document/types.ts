import type { CSSProperties } from "react";

// Re-authored package equivalents of the generated structural types used by the slice
// (`Position`, `Viewport`, `SectionSize`, `TopLevelSectionLayout`). Section kinds are
// application-registered strings, not a closed enum.
export type Position = {
  x: number;
  y: number;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type SectionSizeValue = number | "auto";

export type SectionSize = {
  width: SectionSizeValue;
  height: SectionSizeValue;
};

export type TopLevelSectionLayout = {
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  zIndex: number;
};

// Application-owned opaque serializable section data: the package round-trips it through the
// document and hands it to the kind's registered renderer, but never reads or writes it. The
// JSON-value shape is the serializability contract, mirroring the reference's plugin-section
// `data` payloads.
export type WorkspaceSectionData =
  | string
  | number
  | boolean
  | null
  | Array<WorkspaceSectionData>
  | { [key: string]: WorkspaceSectionData };

// The resolved structural section record. The application resolves any variant indirection
// on its side of the seam; the package never sees unresolved variants.
export type WorkspaceSection = {
  id: string;
  kind: string;
  name: string;
  size: SectionSize;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  isHorizontalOrientation: boolean;
  styleColor: string | null;
  tagColor: string | null;
  children: Array<string>;
  data?: WorkspaceSectionData;
};

// The load shape of a section: `size` may be omitted, in which case the kind's registered
// default (or the reference's auto/auto default) applies at load. Canonical sections always
// carry their resolved size, so a document emitted by the package loads back unchanged.
export type WorkspaceSectionInput = Omit<WorkspaceSection, "size"> & { size?: SectionSize };

// The controlled serializable workspace document: the canonical shape the document-change
// callback and `getWorkspaceDocument` emit, and a valid `loadWorkspaceDocument` input. It
// mirrors the reference's persisted project surface for the slice — structural sections,
// top-level layout, camera, and selection (the reference persists selection through
// `route_set_active_ids`).
export type WorkspaceDocument = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  // null loads without a saved camera; the canvas fits the content on init.
  viewport: Viewport | null;
  activeIds: Array<string>;
};

// The load shape of a document: sections may omit their sizes.
export type WorkspaceDocumentInput = Omit<WorkspaceDocument, "sections"> & {
  sections: Record<string, WorkspaceSectionInput>;
};

export type Node = {
  id: string;
  position: Position;
  width: number | null;
  height: number | null;
  zIndex: number;
  tempZIndex: number;
  kind: string;
  style?: CSSProperties;
};
