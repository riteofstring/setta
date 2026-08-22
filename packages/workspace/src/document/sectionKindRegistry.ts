import type { ComponentType, ReactNode } from "react";
import type { MetaControlKind } from "../controls/meta/metaControlTypes";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import type { SectionSize, WorkspaceItem, WorkspaceSection } from "./types";
import {
  cloneFrozenWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "./workspaceSnapshot";
import type { WorkspaceHost } from "../workspaceHost";

// The registration half of the renderer seam: application-owned section kinds map to their
// renderer and either ordinary header/default-size metadata or the direct-on-canvas presentation.
// This replaces the reference's per-type area switch (`SectionContainerCoreResizabe`), header icon
// record (`HeaderIcon`), and generated per-type constructors. Groups are the one package-owned kind
// and never appear in the registry.

export type MetaControlSectionPresentation = {
  type: "meta-control";
  // The host resolves its opaque section data into the package control vocabulary. Keeping
  // this projection on the registered kind lets the package apply control-specific sizing
  // without adding a typed control model to WorkspaceSection.data.
  resolveControlKind: (
    section: Pick<WorkspaceSection, "id" | "kind" | "name" | "data">,
  ) => MetaControlKind;
  // Frozen main's outboard adjustments button opens application-owned configuration. The
  // package owns its placement and interaction boundary; the host owns what editing means.
  onEdit: (section: WorkspaceSection) => void;
};

export type WorkspaceInspectorContributionContext =
  | {
      type: "section";
      section: WorkspaceSnapshot<WorkspaceSection>;
    }
  | {
      type: "item";
      section: WorkspaceSnapshot<WorkspaceSection>;
      item: WorkspaceSnapshot<WorkspaceItem>;
    };

export type WorkspaceItemFactoryContext = Readonly<{
  section: WorkspaceSnapshot<WorkspaceSection>;
}>;

export type WorkspaceItemFactory = (
  context: WorkspaceItemFactoryContext,
) => WorkspaceItem;

export type WorkspaceItemSearchContext = Readonly<{
  section: WorkspaceSnapshot<
    Pick<WorkspaceSection, "id" | "kind" | "name" | "data">
  >;
  item: WorkspaceSnapshot<WorkspaceItem>;
}>;

export type WorkspaceItemSearchableText = (
  context: WorkspaceItemSearchContext,
) => string;

export type WorkspaceSectionKindIconProps = Readonly<{
  className?: string;
  sectionId: string;
}>;

// The item toolbar is package-owned, so a kind that carries items declares which of its exact
// behaviors it wants instead of leaving the package to infer one from a missing item factory,
// a locked section, an empty tree, or application data.
// The mode union is the public surface; this list stays module-private so registration has one
// runtime source for it.
const WORKSPACE_ITEM_TOOLBAR_MODES = [
  "authoring-and-filter",
  "filter-only",
  "hidden",
] as const;

export type WorkspaceItemToolbarMode =
  (typeof WORKSPACE_ITEM_TOOLBAR_MODES)[number];

// The one generic item-area contract: an application-owned leading control above the package's
// item toolbar and registered item content. The slot is deliberately content-agnostic — the
// package never learns what the leading control edits.
export type WorkspaceItemAreaPresentation = Readonly<{
  renderLeadingContent?: (section: WorkspaceSection) => ReactNode;
  toolbar: WorkspaceItemToolbarMode;
}>;

// An ordinary registered kind may opt into the package's existing sortable child-section
// surface. The capability deliberately names only the ordinary vertical flow: group-specific
// orientation, overflow, chrome, and ungrouping remain package-owned group behavior.
type WorkspaceNestedSectionsPresentation = "vertical";

type WorkspaceInspectorContributionInput =
  | { type: "section"; section: WorkspaceSection }
  | { type: "item"; section: WorkspaceSection; item: WorkspaceItem };

export function createWorkspaceInspectorContributionContext(
  context: WorkspaceInspectorContributionInput,
): WorkspaceInspectorContributionContext {
  return cloneFrozenWorkspaceSnapshot(
    context,
  ) as WorkspaceInspectorContributionContext;
}

type SectionKindBaseDefinition = {
  // Rendered as the section body inside the package-owned shell, chrome, and header. The
  // section carries the kind's opaque `data`; the package never interprets it. Ordinary
  // registered content is placed in the package-owned body slot, so renderers never need a
  // private section-grid class.
  renderContent: (section: WorkspaceSection) => ReactNode;
  // Section icon component, rendered with each package surface's icon treatment. The explicit
  // section ID lets data-driven icons paint consistently in headers, Outline, and future section
  // surfaces without relying on a surface-specific hidden context. Kinds without one render the
  // reference's `gg-menu` fallback glyph.
  icon?: ComponentType<WorkspaceSectionKindIconProps>;
  // Custom section data and custom item data stay opaque to the package. A kind may project
  // either selection into host-owned Inspector UI through this typed, deeply frozen snapshot.
  renderInspector?: (
    context: WorkspaceInspectorContributionContext,
  ) => ReactNode;
  // Runs once per section of this kind at load, before the document is published. A kind whose
  // `data` has a real shape parses it here so a malformed document fails at the boundary instead
  // of on first paint. The built-in content sections register their own; a kind without one keeps
  // its data opaque to the package, exactly as before.
  assertValidData?: (section: WorkspaceSection) => void;
};

export type SectionKindDefinition = SectionKindBaseDefinition &
  (
    | {
        // Applied when an ordinary loaded section omits its size. Kinds without one load at the
        // reference's auto/auto default, exactly like `createSectionSize()` without options.
        defaultSize?: SectionSize;
        // Appended to the package-owned body-slot wrapper. This is for host presentation such as
        // padding or flex layout; the package continues to own the grid placement itself.
        contentClassName?: string;
        // The host owns domain defaults and stable identity. The package calls this only for an
        // explicit insertion request, then validates and places the returned complete item.
        createItem?: WorkspaceItemFactory;
        // Custom opaque items have no package-owned label. Their owning kind may contribute one
        // search string from frozen public snapshots without putting derived text in the document.
        getItemSearchableText?: WorkspaceItemSearchableText;
        // Required of every kind whose documents carry an item tree. The package renders leading
        // content, the declared toolbar, and registered content in that fixed order.
        itemArea?: WorkspaceItemAreaPresentation;
        // Placed in the header's trailing control group, ahead of the container controls (lock,
        // minimize, delete) — the reference's own slot for its per-type header controls. The
        // built-in Text section's edit/render toggle is the package's one use of it.
        renderHeaderControls?: (section: WorkspaceSection) => ReactNode;
        // Lets this ordinary kind own section children through the package's existing nested
        // sortable surface. The one supported registered flow is vertical.
        nestedSections?: WorkspaceNestedSectionsPresentation;
        presentation?: undefined;
      }
    | {
        // Direct-on-canvas kinds opt into package-owned chrome and per-control default/minimum
        // geometry; a competing registered default would make that contract ambiguous.
        defaultSize?: never;
        contentClassName?: never;
        createItem?: never;
        getItemSearchableText?: never;
        itemArea?: never;
        renderHeaderControls?: never;
        nestedSections?: never;
        presentation: MetaControlSectionPresentation;
      }
  );

const registeredSectionKindsByHost = new WeakMap<
  WorkspaceHost,
  Record<string, SectionKindDefinition>
>();

function getRegisteredSectionKinds(
  host: WorkspaceHost,
): Record<string, SectionKindDefinition> {
  return registeredSectionKindsByHost.get(host) ?? {};
}

function assertMetaControlPresentation(
  kind: string,
  presentation: unknown,
): asserts presentation is MetaControlSectionPresentation {
  if (presentation === null || typeof presentation !== "object") {
    throw new Error(`Section kind ${kind} has a malformed presentation.`);
  }
  const candidate = presentation as Partial<MetaControlSectionPresentation> & {
    type?: unknown;
  };
  if (candidate.type !== "meta-control") {
    throw new Error(
      `Section kind ${kind} has unknown presentation type ${String(candidate.type)}.`,
    );
  }
  if (typeof candidate.resolveControlKind !== "function") {
    throw new Error(
      `Meta-control section kind ${kind} must provide resolveControlKind.`,
    );
  }
  if (typeof candidate.onEdit !== "function") {
    throw new Error(`Meta-control section kind ${kind} must provide onEdit.`);
  }
}

function assertOptionalSectionKindFunction(
  kind: string,
  role: string,
  value: unknown,
): void {
  if (value !== undefined && typeof value !== "function") {
    throw new Error(`Section kind ${kind} ${role} must be a function.`);
  }
}

function assertItemAreaPresentation(
  kind: string,
  itemArea: WorkspaceItemAreaPresentation,
): void {
  if (itemArea === null || typeof itemArea !== "object") {
    throw new Error(
      `Section kind ${kind} has a malformed item-area presentation.`,
    );
  }
  if (!WORKSPACE_ITEM_TOOLBAR_MODES.includes(itemArea.toolbar)) {
    throw new Error(
      `Section kind ${kind} declares the unknown item toolbar mode ` +
        `${String(itemArea.toolbar)}.`,
    );
  }
  assertOptionalSectionKindFunction(
    kind,
    "renderLeadingContent",
    itemArea.renderLeadingContent,
  );
}

function assertMetaControlDefinition(
  kind: string,
  definition: SectionKindDefinition,
): void {
  assertMetaControlPresentation(kind, definition.presentation);
  if (definition.itemArea !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register an item-area presentation; ` +
        "meta controls cannot carry item trees.",
    );
  }
  if (definition.defaultSize !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register a defaultSize; ` +
        "the package owns control-specific default geometry.",
    );
  }
  if (definition.contentClassName !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register a contentClassName; ` +
        "the package owns its full-area control placement.",
    );
  }
  if (definition.createItem !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register createItem; ` +
        "meta controls cannot carry item trees.",
    );
  }
  if (definition.getItemSearchableText !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register getItemSearchableText; ` +
        "meta controls cannot carry item trees.",
    );
  }
  if (definition.renderHeaderControls !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register renderHeaderControls; ` +
        "its package-owned chrome has no section header.",
    );
  }
  if (definition.nestedSections !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register nestedSections; ` +
        "meta controls cannot own section children.",
    );
  }
}

function assertNestedSectionsPresentation(
  kind: string,
  nestedSections: unknown,
): asserts nestedSections is WorkspaceNestedSectionsPresentation | undefined {
  if (nestedSections !== undefined && nestedSections !== "vertical") {
    throw new Error(
      `Section kind ${kind} declares the unknown nested-sections presentation ` +
        `${String(nestedSections)}.`,
    );
  }
}

function assertSectionKindDefinition(
  kind: string,
  definition: SectionKindDefinition,
): void {
  if (typeof definition.renderContent !== "function") {
    throw new Error(`Section kind ${kind} must provide renderContent.`);
  }
  assertOptionalSectionKindFunction(
    kind,
    "renderInspector",
    definition.renderInspector,
  );
  assertOptionalSectionKindFunction(
    kind,
    "assertValidData",
    definition.assertValidData,
  );
  assertOptionalSectionKindFunction(kind, "createItem", definition.createItem);
  assertOptionalSectionKindFunction(
    kind,
    "renderHeaderControls",
    definition.renderHeaderControls,
  );
  assertOptionalSectionKindFunction(
    kind,
    "getItemSearchableText",
    definition.getItemSearchableText,
  );
  if (definition.presentation !== undefined) {
    assertMetaControlDefinition(kind, definition);
    return;
  }
  assertNestedSectionsPresentation(kind, definition.nestedSections);
  if (definition.itemArea !== undefined) {
    assertItemAreaPresentation(kind, definition.itemArea);
  }
}

// Replaces the registered kind set. Hosts register every kind once, before loading or
// rendering documents that use them.
export function registerSectionKinds(
  host: WorkspaceHost,
  kinds: Record<string, SectionKindDefinition>,
): void {
  if (GROUP_SECTION_KIND in kinds) {
    throw new Error(
      `Section kind ${GROUP_SECTION_KIND} is package-owned and cannot be registered.`,
    );
  }
  for (const [kind, definition] of Object.entries(kinds)) {
    assertSectionKindDefinition(kind, definition);
  }
  registeredSectionKindsByHost.set(host, kinds);
}

export function getRegisteredSectionKindOrThrow(
  host: WorkspaceHost,
  kind: string,
): SectionKindDefinition {
  const definition = getRegisteredSectionKinds(host)[kind];
  if (!definition) {
    throw new Error(
      `Section kind ${kind} is not registered. Call registerSectionKinds with it before ` +
        `loading or rendering documents that use it.`,
    );
  }
  return definition;
}

// Groups are package-owned and register nothing, so they contribute no header controls.
export function getSectionKindHeaderControls(
  host: WorkspaceHost,
  kind: string,
): ((section: WorkspaceSection) => ReactNode) | null {
  if (kind === GROUP_SECTION_KIND) {
    return null;
  }
  const definition = getRegisteredSectionKindOrThrow(host, kind);
  return definition.presentation === undefined
    ? (definition.renderHeaderControls ?? null)
    : null;
}

// Every section that carries items renders one coherent package-owned item area, so the
// declaration is required rather than defaulted. Loading and rendering both resolve it here.
export function getWorkspaceItemAreaPresentationOrThrow(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "id" | "kind">,
): WorkspaceItemAreaPresentation {
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  // A meta-control kind cannot declare an item area at all, so name that constraint here rather
  // than reporting the missing declaration it is forbidden to register.
  if (definition.presentation !== undefined) {
    throw new Error(
      `Section ${section.id} carries an item tree, but section kind ${section.kind} registers a ` +
        "meta-control presentation; meta controls cannot carry item trees.",
    );
  }
  if (!definition.itemArea) {
    throw new Error(
      `Section ${section.id} carries an item tree, but section kind ${section.kind} does not ` +
        "declare an item-area presentation. Register one with an explicit toolbar mode.",
    );
  }
  return definition.itemArea;
}

export function getWorkspaceItemFactory(
  host: WorkspaceHost,
  section: WorkspaceSection,
): WorkspaceItemFactory | null {
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  return definition.presentation === undefined
    ? (definition.createItem ?? null)
    : null;
}

export function createWorkspaceItemFromFactory(
  host: WorkspaceHost,
  section: WorkspaceSection,
): WorkspaceItem {
  const factory = getWorkspaceItemFactory(host, section);
  if (!factory) {
    throw new Error(
      `Section kind ${section.kind} does not provide an item factory.`,
    );
  }
  return factory(cloneFrozenWorkspaceSnapshot({ section }));
}

export function getWorkspaceItemSearchableText(
  host: WorkspaceHost,
  section: WorkspaceSection,
  item: WorkspaceItem,
): string {
  if (item.presentation) {
    return item.presentation.label;
  }
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  const getSearchableText =
    definition.presentation === undefined
      ? definition.getItemSearchableText
      : undefined;
  if (!getSearchableText) {
    return "";
  }
  const searchSection = {
    id: section.id,
    kind: section.kind,
    name: section.name,
    data: section.data,
  };
  const searchableText = getSearchableText(
    cloneFrozenWorkspaceSnapshot({
      section: searchSection,
      item,
    }) as WorkspaceItemSearchContext,
  );
  if (typeof searchableText !== "string") {
    throw new Error(
      `Section kind ${section.kind} returned non-string searchable text for item ${item.id}.`,
    );
  }
  return searchableText;
}

export function getMetaControlPresentation(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "kind">,
): MetaControlSectionPresentation | null {
  const presentation = getRegisteredSectionKindOrThrow(
    host,
    section.kind,
  ).presentation;
  if (presentation === undefined) {
    return null;
  }
  assertMetaControlPresentation(section.kind, presentation);
  return presentation;
}

// One capability check owns the package's distinction between a leaf and a section that may
// contain sections. It includes the package-owned group kind, whose horizontal variant stays a
// separate group concern, and registered ordinary kinds that explicitly declare the vertical
// nested-section surface.
export function canWorkspaceSectionOwnNestedSections(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "kind">,
): boolean {
  if (section.kind === GROUP_SECTION_KIND) {
    return true;
  }
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  return (
    definition.presentation === undefined &&
    definition.nestedSections === "vertical"
  );
}
