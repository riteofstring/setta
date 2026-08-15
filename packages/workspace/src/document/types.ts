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

export type WorkspaceItemTextLanguage =
  "python" | "typescript" | "javascript" | "json" | "yaml" | "toml" | "markdown";

export type WorkspaceItemAutocompletePolicy = "off";

export type WorkspaceItemControlBaseConfiguration = {
  disabled: boolean;
};

export type WorkspaceTextItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  autocomplete: WorkspaceItemAutocompletePolicy;
  placeholder: string | null;
  singleLine: boolean;
  wrapLines: boolean;
};

export type WorkspaceCodeItemControlConfiguration = WorkspaceTextItemControlConfiguration & {
  language: WorkspaceItemTextLanguage;
};

export type WorkspaceTextAreaItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  autocomplete: WorkspaceItemAutocompletePolicy;
  language: WorkspaceItemTextLanguage | null;
  placeholder: string | null;
};

export type WorkspaceSwitchItemControlConfiguration = WorkspaceItemControlBaseConfiguration;

export type WorkspaceDropdownChoiceGroup = {
  group: string;
  choices: Array<string>;
};

export type WorkspaceDropdownItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  choices: Array<string> | Array<WorkspaceDropdownChoiceGroup>;
  placeholder: string | null;
};

export type WorkspaceColorChoice = {
  color: string;
  description: string;
};

export type WorkspaceColorItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  choices: Array<WorkspaceColorChoice> | null;
};

export type WorkspaceNumericItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  min: number;
  max: number;
  step: number;
};

export type WorkspacePasswordItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  placeholder: string | null;
  savedValuePending: boolean;
};

export type WorkspaceDateItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  displayFormat: "iso" | "us" | "eu" | "long";
  controlMode: "input" | "calendar";
  selectionMode: "single" | "multiple";
  weekStart: "sunday" | "monday";
  includeTime: boolean;
  timeDisplayFormat: "twenty_four_hour" | "twelve_hour";
};

export type WorkspaceTimeItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  controlMode: "input" | "display";
  displayFormat: "twenty_four_hour" | "twelve_hour";
  transparent: boolean;
  scale: number;
  font: "clock" | "monospace" | "system";
};

export type WorkspaceDropzoneAttachment = {
  id: string;
  kind: "file" | "text";
  name: string;
  size: number | null;
};

export type WorkspaceDropzonePolicy = {
  maxAttachments: number | null;
  maxFileBytes: number;
  maxTotalBytes: number | null;
  allowedMimePrefixes: Array<string>;
};

export type WorkspaceDropzoneItemControlConfiguration = WorkspaceItemControlBaseConfiguration & {
  attachments: Array<WorkspaceDropzoneAttachment>;
  policy: WorkspaceDropzonePolicy;
  placeholder: string;
  pending: boolean;
  errorMessage: string | null;
};

type WorkspaceValueItemControl<Kind extends string, Configuration> = {
  kind: Kind;
  value: string;
  configuration: Configuration;
};

// The package-owned ordinary item presentation. Changing `kind` requires a complete replacement
// control presentation, so the package never invents configuration while switching UI types.
export type WorkspaceItemControlPresentation =
  | { kind: "group" }
  | WorkspaceValueItemControl<"text", WorkspaceTextItemControlConfiguration>
  | WorkspaceValueItemControl<"code", WorkspaceCodeItemControlConfiguration>
  | WorkspaceValueItemControl<"textarea", WorkspaceTextAreaItemControlConfiguration>
  | WorkspaceValueItemControl<"switch", WorkspaceSwitchItemControlConfiguration>
  | WorkspaceValueItemControl<"dropdown", WorkspaceDropdownItemControlConfiguration>
  | WorkspaceValueItemControl<"color", WorkspaceColorItemControlConfiguration>
  | WorkspaceValueItemControl<"slider", WorkspaceNumericItemControlConfiguration>
  | WorkspaceValueItemControl<"rotary", WorkspaceNumericItemControlConfiguration>
  | WorkspaceValueItemControl<"password", WorkspacePasswordItemControlConfiguration>
  | WorkspaceValueItemControl<"date", WorkspaceDateItemControlConfiguration>
  | WorkspaceValueItemControl<"time", WorkspaceTimeItemControlConfiguration>
  | WorkspaceValueItemControl<"dropzone", WorkspaceDropzoneItemControlConfiguration>;

export type WorkspaceItemControlKind = WorkspaceItemControlPresentation["kind"];

export type WorkspaceItemControlConfiguration =
  Exclude<WorkspaceItemControlPresentation, { kind: "group" }> extends infer Control
    ? Control extends { kind: infer Kind; configuration: infer Configuration }
      ? { kind: Kind; configuration: Configuration }
      : never
    : never;

export type WorkspaceItemPresentation = {
  label: string;
  control: WorkspaceItemControlPresentation;
};

// The package term for the reference's params is "items": the rows a section carries that the
// package can select, order, and nest. A row either uses the package-owned typed presentation or
// remains custom opaque content rendered through `WorkspaceItemList.renderItem`; load validation
// rejects a row that supplies both. The root has neither because it is a structural move target.
export type WorkspaceItem = {
  id: string;
  children: Array<string>;
  data?: WorkspaceSectionData;
  presentation?: WorkspaceItemPresentation;
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
  // Frozen main's group-only overflow flag. Every canonical section carries the field so the
  // public document has one explicit, reload-stable shape; non-group sections must keep it false.
  overflowMode: boolean;
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
