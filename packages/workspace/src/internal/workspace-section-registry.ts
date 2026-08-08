import type { ComponentType, ReactNode } from "react";

import {
  validateWorkspaceDocument,
  type SectionChrome,
  type SectionDimensionMode,
  type SectionOrientation,
  type SectionOverflow,
  type WorkspaceDocument,
  type WorkspaceJsonValue,
  type WorkspaceSection,
} from "../core.js";
import { denseArrayAt, optionOverridesAt } from "./runtime-option-validation.js";
import type {
  SectionContentSizing,
  SectionDefaultSize,
  SectionDefaultSizeMode,
  SectionDefinition,
  SectionRenderProps,
  SectionResizeAxes,
} from "./workspace-section-contract.js";

type ResolvedSectionCreationMetadata = Readonly<{
  group: string | null;
  icon: ReactNode;
  keywords: readonly string[];
}>;

type ResolvedSectionResizeOptions = Readonly<{
  axes: SectionResizeAxes;
  maxSize: Partial<SectionDefaultSize>;
  minSize: Partial<SectionDefaultSize>;
  preserveAspectRatio: boolean;
}>;

export type ResolvedSectionDefinition<TSectionData = WorkspaceJsonValue> = Readonly<{
  canContainSections: boolean;
  chrome: SectionChrome;
  contentSizing: SectionContentSizing;
  creation: ResolvedSectionCreationMetadata;
  defaultChildOrientation: SectionOrientation;
  defaultChildOverflow: SectionOverflow;
  defaultSize: SectionDefaultSize;
  defaultSizeMode: SectionDefaultSizeMode;
  defaultTitle: string;
  displayName: string;
  kind: string;
  minimizable: boolean;
  render: ComponentType<SectionRenderProps<TSectionData>>;
  resize: ResolvedSectionResizeOptions;
}>;

const definitionKeys = [
  "canContainSections",
  "chrome",
  "contentSizing",
  "creation",
  "defaultChildOrientation",
  "defaultChildOverflow",
  "defaultSize",
  "defaultSizeMode",
  "defaultTitle",
  "displayName",
  "kind",
  "minimizable",
  "render",
  "resize",
] as const;
const dimensionKeys = ["height", "width"] as const;
const resizeKeys = ["axes", "maxSize", "minSize", "preserveAspectRatio"] as const;
const creationKeys = ["group", "icon", "keywords"] as const;

type DefinitionRecord = Record<string, unknown>;
type SectionAxis = (typeof dimensionKeys)[number];

function recordAt(
  value: unknown,
  supportedKeys: readonly string[],
  label: string,
  fieldLabel: string,
): DefinitionRecord {
  if (value === undefined) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return optionOverridesAt(value, supportedKeys, label, fieldLabel);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function booleanOrDefault(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
}

function booleanAt(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
  return value;
}

function dimensionMode(value: unknown, label: string): SectionDimensionMode {
  if (value === "content" || value === "fixed") {
    return value;
  }
  throw new TypeError(`${label} must be content or fixed.`);
}

function sizeAt(value: unknown, label: string): SectionDefaultSize {
  const record = recordAt(value, dimensionKeys, label, "section size field");
  return Object.freeze({
    height: positiveNumber(record.height, `${label} height`),
    width: positiveNumber(record.width, `${label} width`),
  });
}

function sizeModeAt(value: unknown, label: string): SectionDefaultSizeMode {
  if (value === undefined) {
    return Object.freeze({ height: "fixed", width: "fixed" });
  }
  const record = recordAt(value, dimensionKeys, label, "section size-mode field");
  return Object.freeze({
    height: dimensionMode(record.height, `${label} height`),
    width: dimensionMode(record.width, `${label} width`),
  });
}

function contentSizingAt(value: unknown, label: string): SectionContentSizing {
  if (value === undefined) {
    return Object.freeze({ height: true, width: true });
  }
  const record = recordAt(value, dimensionKeys, label, "section content-sizing field");
  return Object.freeze({
    height: booleanAt(record.height, `${label} height`),
    width: booleanAt(record.width, `${label} width`),
  });
}

function partialSizeAt(value: unknown, label: string): Partial<SectionDefaultSize> {
  if (value === undefined) {
    return Object.freeze({});
  }
  const record = recordAt(value, dimensionKeys, label, "section size constraint field");
  const resolved: { height?: number; width?: number } = {};
  for (const axis of dimensionKeys) {
    if (Object.hasOwn(record, axis)) {
      resolved[axis] = positiveNumber(record[axis], `${label} ${axis}`);
    }
  }
  return Object.freeze(resolved);
}

function resizeAxes(value: unknown, label: string): SectionResizeAxes {
  if (value === "both" || value === "horizontal" || value === "none" || value === "vertical") {
    return value;
  }
  throw new TypeError(`${label} must be both, horizontal, vertical, or none.`);
}

function resizeAt(value: unknown, label: string): ResolvedSectionResizeOptions {
  if (value === undefined) {
    return Object.freeze({
      axes: "both",
      maxSize: Object.freeze({}),
      minSize: Object.freeze({}),
      preserveAspectRatio: false,
    });
  }
  const record = recordAt(value, resizeKeys, label, "section resize field");
  return Object.freeze({
    axes: resizeAxes(record.axes, `${label} axes`),
    maxSize: partialSizeAt(record.maxSize, `${label} maximum size`),
    minSize: partialSizeAt(record.minSize, `${label} minimum size`),
    preserveAspectRatio: booleanOrDefault(
      record.preserveAspectRatio,
      false,
      `${label} preserveAspectRatio`,
    ),
  });
}

function keywordsAt(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  const keywords = denseArrayAt(value, label).map((keyword, index) =>
    nonEmptyString(keyword, `${label} at index ${String(index)}`),
  );
  if (new Set(keywords).size !== keywords.length) {
    throw new TypeError(`${label} must not contain duplicates.`);
  }
  return Object.freeze(keywords);
}

function creationAt(value: unknown, label: string): ResolvedSectionCreationMetadata {
  if (value === undefined) {
    return Object.freeze({ group: null, icon: null, keywords: Object.freeze([]) });
  }
  const record = recordAt(value, creationKeys, label, "section creation field");
  return Object.freeze({
    group: record.group === undefined ? null : nonEmptyString(record.group, `${label} group`),
    icon: (record.icon ?? null) as ReactNode,
    keywords: keywordsAt(record.keywords, `${label} keywords`),
  });
}

function chromeAt(value: unknown, label: string): SectionChrome {
  if (value === undefined) {
    return "default";
  }
  if (value === "compact" || value === "default" || value === "none" || value === "transparent") {
    return value;
  }
  throw new TypeError(`${label} must be compact, default, transparent, or none.`);
}

function orientationAt(value: unknown, label: string): SectionOrientation {
  if (value === undefined || value === "vertical") {
    return "vertical";
  }
  if (value === "horizontal") {
    return value;
  }
  throw new TypeError(`${label} must be vertical or horizontal.`);
}

function overflowAt(value: unknown, label: string): SectionOverflow {
  if (value === undefined || value === "grow") {
    return "grow";
  }
  if (value === "scroll") {
    return value;
  }
  throw new TypeError(`${label} must be grow or scroll.`);
}

type AxisDefaultDefinition = Pick<
  ResolvedSectionDefinition<unknown>,
  "contentSizing" | "defaultSize" | "defaultSizeMode" | "kind" | "resize"
>;

function assertContentSizingDefault(axis: SectionAxis, definition: AxisDefaultDefinition): void {
  if (definition.defaultSizeMode[axis] !== "content" || definition.contentSizing[axis]) {
    return;
  }
  throw new TypeError(
    `Section definition ${JSON.stringify(definition.kind)} cannot default ${axis} to content sizing when that axis is disabled.`,
  );
}

function assertConstraintOrder(axis: SectionAxis, definition: AxisDefaultDefinition): void {
  const minimum = definition.resize.minSize[axis];
  const maximum = definition.resize.maxSize[axis];
  if (minimum === undefined || maximum === undefined || minimum <= maximum) {
    return;
  }
  throw new TypeError(
    `Section definition ${JSON.stringify(definition.kind)} ${axis} minimum cannot exceed its maximum.`,
  );
}

function assertDefaultSizeRange(axis: SectionAxis, definition: AxisDefaultDefinition): void {
  const size = definition.defaultSize[axis];
  const minimum = definition.resize.minSize[axis];
  const maximum = definition.resize.maxSize[axis];
  if (minimum !== undefined && size < minimum) {
    throw new TypeError(
      `Section definition ${JSON.stringify(definition.kind)} default ${axis} is below its minimum.`,
    );
  }
  if (maximum !== undefined && size > maximum) {
    throw new TypeError(
      `Section definition ${JSON.stringify(definition.kind)} default ${axis} exceeds its maximum.`,
    );
  }
}

function assertAxisDefaults(axis: SectionAxis, definition: AxisDefaultDefinition): void {
  assertContentSizingDefault(axis, definition);
  assertConstraintOrder(axis, definition);
  assertDefaultSizeRange(axis, definition);
}

function resolveDefinition<TSectionData>(
  value: unknown,
  index: number,
): ResolvedSectionDefinition<TSectionData> {
  const label = `Section definition at index ${String(index)}`;
  const record = recordAt(value, definitionKeys, label, "section definition field");
  const kind = nonEmptyString(record.kind, `${label} kind`);
  const canContainSections = booleanOrDefault(
    record.canContainSections,
    false,
    `${label} canContainSections`,
  );
  if (
    !canContainSections &&
    (Object.hasOwn(record, "defaultChildOrientation") ||
      Object.hasOwn(record, "defaultChildOverflow"))
  ) {
    throw new TypeError(
      `Section definition ${JSON.stringify(kind)} cannot declare child-layout defaults when canContainSections is false.`,
    );
  }
  if (typeof record.render !== "function") {
    throw new TypeError(`${label} render must be a React component.`);
  }
  const displayName = nonEmptyString(record.displayName, `${label} displayName`);
  const resolved: ResolvedSectionDefinition<TSectionData> = Object.freeze({
    canContainSections,
    chrome: chromeAt(record.chrome, `${label} chrome`),
    contentSizing: contentSizingAt(record.contentSizing, `${label} contentSizing`),
    creation: creationAt(record.creation, `${label} creation`),
    defaultChildOrientation: orientationAt(
      record.defaultChildOrientation,
      `${label} defaultChildOrientation`,
    ),
    defaultChildOverflow: overflowAt(record.defaultChildOverflow, `${label} defaultChildOverflow`),
    defaultSize: sizeAt(record.defaultSize, `${label} defaultSize`),
    defaultSizeMode: sizeModeAt(record.defaultSizeMode, `${label} defaultSizeMode`),
    defaultTitle:
      record.defaultTitle === undefined
        ? displayName
        : nonEmptyString(record.defaultTitle, `${label} defaultTitle`),
    displayName,
    kind,
    minimizable: booleanOrDefault(record.minimizable, true, `${label} minimizable`),
    render: record.render as ComponentType<SectionRenderProps<TSectionData>>,
    resize: resizeAt(record.resize, `${label} resize`),
  });
  for (const axis of dimensionKeys) {
    assertAxisDefaults(axis, resolved as ResolvedSectionDefinition<unknown>);
  }
  return resolved;
}

export class WorkspaceSectionRegistry<TSectionData = WorkspaceJsonValue> {
  readonly #definitionList: readonly ResolvedSectionDefinition<TSectionData>[];
  readonly #definitions: ReadonlyMap<string, ResolvedSectionDefinition<TSectionData>>;

  constructor(definitions: readonly ResolvedSectionDefinition<TSectionData>[]) {
    this.#definitionList = Object.freeze([...definitions]);
    this.#definitions = new Map(definitions.map((definition) => [definition.kind, definition]));
  }

  definition(kind: string): ResolvedSectionDefinition<TSectionData> | undefined {
    return this.#definitions.get(kind);
  }

  definitions(): readonly ResolvedSectionDefinition<TSectionData>[] {
    return this.#definitionList;
  }
}

export function resolveSectionDefinitions<TSectionData>(
  definitions: readonly SectionDefinition<TSectionData>[] | undefined,
): WorkspaceSectionRegistry<TSectionData> {
  if (definitions === undefined) {
    return new WorkspaceSectionRegistry([]);
  }
  const resolved = denseArrayAt(definitions, "Workspace section definitions").map(
    (definition, index) => resolveDefinition<TSectionData>(definition, index),
  );
  const kinds = new Set<string>();
  for (const definition of resolved) {
    if (kinds.has(definition.kind)) {
      throw new TypeError(`Duplicate section definition kind ${JSON.stringify(definition.kind)}.`);
    }
    kinds.add(definition.kind);
  }
  return new WorkspaceSectionRegistry(resolved);
}

function assertSectionAxis(
  section: WorkspaceSection<unknown>,
  definition: ResolvedSectionDefinition<unknown>,
  axis: SectionAxis,
): void {
  if (section.size[axis].mode === "content" && !definition.contentSizing[axis]) {
    throw new TypeError(
      `Workspace section ${JSON.stringify(section.id)} uses unsupported content sizing on ${axis}.`,
    );
  }
  const value = section.size[axis].value;
  const minimum = definition.resize.minSize[axis];
  const maximum = definition.resize.maxSize[axis];
  if (minimum !== undefined && value < minimum) {
    throw new TypeError(
      `Workspace section ${JSON.stringify(section.id)} ${axis} is below its registered minimum.`,
    );
  }
  if (maximum !== undefined && value > maximum) {
    throw new TypeError(
      `Workspace section ${JSON.stringify(section.id)} ${axis} exceeds its registered maximum.`,
    );
  }
}

export function validateWorkspaceSectionDefinitions<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  registry: WorkspaceSectionRegistry<TSectionData>,
): void {
  validateWorkspaceDocument(document);
  for (const section of Object.values(document.sections)) {
    const definition = registry.definition(section.kind);
    if (!definition) {
      throw new TypeError(
        `Workspace section ${JSON.stringify(section.id)} uses unregistered kind ${JSON.stringify(section.kind)}.`,
      );
    }
    if (section.childLayout && !definition.canContainSections) {
      throw new TypeError(
        `Workspace section ${JSON.stringify(section.id)} has children but its registered definition cannot contain sections.`,
      );
    }
    if (section.isMinimized && !definition.minimizable) {
      throw new TypeError(
        `Workspace section ${JSON.stringify(section.id)} is minimized but its registered definition is not minimizable.`,
      );
    }
    for (const axis of dimensionKeys) {
      assertSectionAxis(
        section as WorkspaceSection<unknown>,
        definition as ResolvedSectionDefinition<unknown>,
        axis,
      );
    }
  }
}
