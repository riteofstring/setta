import type { ComponentType, ReactNode } from "react";
import type { MetaControlKind } from "../controls/meta/metaControlTypes.js";
import { GROUP_SECTION_KIND } from "./documentSelectors.js";
import type { SectionSize, WorkspaceItem, WorkspaceSection } from "./types.js";
import {
  cloneFrozenWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "./workspaceSnapshot.js";
import {
  getWorkspaceSectionSizeBounds,
  type WorkspaceSectionSizeConstraints,
} from "../section/resize/sectionSizingBounds.js";
import type { WorkspaceHost } from "../workspaceHost.js";

export type MetaControlSectionPresentation = {
  type: "meta-control";

  resolveControlKind: (
    section: Pick<WorkspaceSection, "id" | "kind" | "name" | "data">,
  ) => MetaControlKind;

  onEdit?: (section: WorkspaceSection) => void;
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

export type WorkspaceSectionSearchableText = (
  section: WorkspaceSnapshot<
    Pick<WorkspaceSection, "id" | "kind" | "name" | "data">
  >,
) => string;

export type WorkspaceSectionKindIconProps = Readonly<{
  className?: string;
  sectionId: string;
}>;

const WORKSPACE_ITEM_TOOLBAR_MODES = [
  "authoring-and-filter",
  "filter-only",
  "hidden",
] as const;

export type WorkspaceItemToolbarMode =
  (typeof WORKSPACE_ITEM_TOOLBAR_MODES)[number];

export type WorkspaceItemAreaPresentation = Readonly<{
  renderLeadingContent?: (section: WorkspaceSection) => ReactNode;
  toolbar: WorkspaceItemToolbarMode;
}>;

type WorkspaceNestedSectionsPresentation = "vertical";

type WorkspaceNestedSectionAcceptance = (section: WorkspaceSection) => boolean;

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
  renderContent: (section: WorkspaceSection) => ReactNode;

  icon?: ComponentType<WorkspaceSectionKindIconProps>;

  renderInspector?: (
    context: WorkspaceInspectorContributionContext,
  ) => ReactNode;

  assertValidData?: (section: WorkspaceSection) => void;
};

export type SectionKindDefinition = SectionKindBaseDefinition &
  (
    | {
        defaultSize?: SectionSize;

        sizeConstraints?: WorkspaceSectionSizeConstraints;

        contentClassName?: string;

        createItem?: WorkspaceItemFactory;

        getItemSearchableText?: WorkspaceItemSearchableText;

        getSectionSearchableText?: WorkspaceSectionSearchableText;

        itemArea?: WorkspaceItemAreaPresentation;

        renderHeaderControls?: (section: WorkspaceSection) => ReactNode;

        renderAttachedContent?: (section: WorkspaceSection) => ReactNode;

        deleteActionLabel?: string;

        nestedSections?: WorkspaceNestedSectionsPresentation;

        canAcceptNestedSection?: WorkspaceNestedSectionAcceptance;
        presentation?: undefined;
      }
    | {
        defaultSize?: never;
        sizeConstraints?: never;
        contentClassName?: never;
        createItem?: never;
        getItemSearchableText?: never;
        getSectionSearchableText?: never;
        itemArea?: never;
        renderHeaderControls?: never;
        renderAttachedContent?: never;
        deleteActionLabel?: never;
        nestedSections?: never;
        canAcceptNestedSection?: never;
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
  assertOptionalSectionKindFunction(
    kind,
    "presentation.onEdit",
    candidate.onEdit,
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSizeConstraintDimension(
  kind: string,
  candidate: Record<string, unknown>,
  dimensionName: keyof WorkspaceSectionSizeConstraints,
): number {
  const value = candidate[dimensionName];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Section kind ${kind} size constraint ${dimensionName} must be a finite non-negative number.`,
    );
  }
  return value;
}

function readSectionKindSizeConstraints(
  kind: string,
  constraints: unknown,
): WorkspaceSectionSizeConstraints {
  if (!isRecord(constraints)) {
    throw new Error(`Section kind ${kind} has malformed size constraints.`);
  }
  return {
    minHeight: readSizeConstraintDimension(kind, constraints, "minHeight"),
    maxHeight: readSizeConstraintDimension(kind, constraints, "maxHeight"),
    minWidth: readSizeConstraintDimension(kind, constraints, "minWidth"),
    maxWidth: readSizeConstraintDimension(kind, constraints, "maxWidth"),
  };
}

function assertValidSectionKindSizeConstraints(
  kind: string,
  constraints: WorkspaceSectionSizeConstraints,
): void {
  if (
    constraints.minHeight > constraints.maxHeight ||
    constraints.minWidth > constraints.maxWidth
  ) {
    throw new Error(
      `Section kind ${kind} has contradictory minimum and maximum size constraints.`,
    );
  }
  const bounds = getWorkspaceSectionSizeBounds(constraints);
  if (
    bounds.minHeight > bounds.maxHeight ||
    bounds.minWidth > bounds.maxWidth
  ) {
    throw new Error(
      `Section kind ${kind} size constraints contradict the workspace safety bounds.`,
    );
  }
}

function assertSectionKindSizeConstraints(
  kind: string,
  constraints: unknown,
): asserts constraints is WorkspaceSectionSizeConstraints | undefined {
  if (constraints === undefined) {
    return;
  }
  assertValidSectionKindSizeConstraints(
    kind,
    readSectionKindSizeConstraints(kind, constraints),
  );
}

function assertMetaControlDoesNotRegister(
  kind: string,
  property: string,
  value: unknown,
  constraint: string,
): void {
  if (value !== undefined) {
    throw new Error(
      `Meta-control section kind ${kind} cannot register ${property}; ${constraint}`,
    );
  }
}

function assertMetaControlDefinition(
  kind: string,
  definition: SectionKindDefinition,
): void {
  assertMetaControlPresentation(kind, definition.presentation);
  assertMetaControlDoesNotRegister(
    kind,
    "an item-area presentation",
    definition.itemArea,
    "meta controls cannot carry item trees.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "a defaultSize",
    definition.defaultSize,
    "the package owns control-specific default geometry.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "size constraints",
    definition.sizeConstraints,
    "the package owns control-specific sizing.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "a contentClassName",
    definition.contentClassName,
    "the package owns its full-area control placement.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "createItem",
    definition.createItem,
    "meta controls cannot carry item trees.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "getItemSearchableText",
    definition.getItemSearchableText,
    "meta controls cannot carry item trees.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "getSectionSearchableText",
    definition.getSectionSearchableText,
    "meta controls do not provide ordinary section search text.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "renderHeaderControls",
    definition.renderHeaderControls,
    "its package-owned chrome has no section header.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "renderAttachedContent",
    definition.renderAttachedContent,
    "meta controls render directly on the canvas.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "deleteActionLabel",
    definition.deleteActionLabel,
    "its package-owned chrome has no section header.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "nestedSections",
    definition.nestedSections,
    "meta controls cannot own section children.",
  );
  assertMetaControlDoesNotRegister(
    kind,
    "canAcceptNestedSection",
    definition.canAcceptNestedSection,
    "meta controls cannot own section children.",
  );
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
    "renderAttachedContent",
    definition.renderAttachedContent,
  );
  assertOptionalSectionKindFunction(
    kind,
    "canAcceptNestedSection",
    definition.canAcceptNestedSection,
  );
  assertOptionalSectionKindFunction(
    kind,
    "getItemSearchableText",
    definition.getItemSearchableText,
  );
  assertOptionalSectionKindFunction(
    kind,
    "getSectionSearchableText",
    definition.getSectionSearchableText,
  );
  if (definition.presentation !== undefined) {
    assertMetaControlDefinition(kind, definition);
    return;
  }
  assertSectionKindSizeConstraints(kind, definition.sizeConstraints);
  assertNestedSectionsPresentation(kind, definition.nestedSections);
  if (definition.itemArea !== undefined) {
    assertItemAreaPresentation(kind, definition.itemArea);
  }
}

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

export function getSectionKindDeleteActionLabel(
  host: WorkspaceHost,
  kind: string,
): string | null {
  if (kind === GROUP_SECTION_KIND) {
    return null;
  }
  const definition = getRegisteredSectionKindOrThrow(host, kind);
  return definition.presentation === undefined
    ? (definition.deleteActionLabel ?? null)
    : null;
}

export function getWorkspaceItemAreaPresentationOrThrow(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "id" | "kind">,
): WorkspaceItemAreaPresentation {
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);

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

export function getWorkspaceSectionSearchableText(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "id" | "kind" | "name" | "data">,
): string {
  if (section.kind === GROUP_SECTION_KIND) {
    return "";
  }
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  const getSearchableText =
    definition.presentation === undefined
      ? definition.getSectionSearchableText
      : undefined;
  if (!getSearchableText) {
    return "";
  }
  const searchableText = getSearchableText(
    cloneFrozenWorkspaceSnapshot({
      id: section.id,
      kind: section.kind,
      name: section.name,
      data: section.data,
    }) as WorkspaceSnapshot<
      Pick<WorkspaceSection, "id" | "kind" | "name" | "data">
    >,
  );
  if (typeof searchableText !== "string") {
    throw new Error(
      `Section kind ${section.kind} returned non-string searchable text for section ${section.id}.`,
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

export function getSectionKindSizeConstraints(
  host: WorkspaceHost,
  section: Pick<WorkspaceSection, "kind">,
): WorkspaceSectionSizeConstraints | null {
  if (section.kind === GROUP_SECTION_KIND) {
    return null;
  }
  const definition = getRegisteredSectionKindOrThrow(host, section.kind);
  return definition.presentation === undefined
    ? (definition.sizeConstraints ?? null)
    : null;
}

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

export function canWorkspaceSectionAcceptNestedSection(
  host: WorkspaceHost,
  parent: Pick<WorkspaceSection, "kind">,
  source: WorkspaceSection,
): boolean {
  if (parent.kind === GROUP_SECTION_KIND) {
    return true;
  }
  const definition = getRegisteredSectionKindOrThrow(host, parent.kind);
  return (
    definition.presentation === undefined &&
    definition.nestedSections === "vertical" &&
    (definition.canAcceptNestedSection?.(source) ?? true)
  );
}
