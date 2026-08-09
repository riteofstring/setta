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
};

// The controlled serializable workspace document: the shape a host passes to
// `loadWorkspaceDocument` and receives back from the document-change callback. It mirrors the
// reference's persisted project surface for the slice — structural sections, top-level layout,
// camera, and selection (the reference persists selection through `route_set_active_ids`).
export type WorkspaceDocument = {
  sections: Record<string, WorkspaceSection>;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  // null loads without a saved camera; the canvas fits the content on init.
  viewport: Viewport | null;
  activeIds: Array<string>;
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
