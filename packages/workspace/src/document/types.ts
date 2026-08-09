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

// The package term for the reference's params is "items": the rows a section carries that the
// package can select, order, and nest. Item data is opaque exactly like section data — the
// package owns only the structure (id, ordered children) and selection; rendering and any
// leaf-versus-group semantics stay application-side behind the registered item surface.
export type WorkspaceItem = {
  id: string;
  children: Array<string>;
  data?: WorkspaceSectionData;
};

// The canonical per-section item tree, mirroring the reference's per-section param root
// (`getParamRootId`): one root item whose children are the top-level rows. The root is a real
// move target (the reference normalizes section-level drops onto it) but never a row, so it can
// never be selected. Where the reference promotes a leaf param to `NestedParam` when something
// drops into it, package items always carry `children`, so that promotion is structural.
// Selection is part of the canonical tree — the reference persists `selectedParams` on the
// section impl through its toggle routes.
export type WorkspaceSectionItemTree = {
  rootId: string;
  items: Record<string, WorkspaceItem>;
  selectedItemIds: Array<string>;
  // The authored label-column width, excluding the center-gutter offset. When omitted, the
  // mounted item surface derives the reference's half-width default from its live container.
  // Drag and reset commits persist this package-owned item-layout value in the document.
  itemColumnWidth?: number;
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
  data?: WorkspaceSectionData;
  // Absent for sections without items, mirroring the reference's params-free section types.
  itemTree?: WorkspaceSectionItemTree;
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
