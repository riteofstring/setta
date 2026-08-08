import type { WorkspacePoint, WorkspaceSection } from "../core.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";

export type WorkspaceSectionResizeAxis = "height" | "width";
export type WorkspaceSectionResizeHandle = "block-end" | "corner" | "inline-end";
export type WorkspaceSectionInlineEnd = "left" | "right";

export type WorkspaceSectionMeasuredSize = Readonly<{
  height: number;
  width: number;
}>;

export type WorkspaceRootResizeSnapshot = Readonly<{
  position: WorkspacePoint;
  size: WorkspaceSectionMeasuredSize;
}>;

type WorkspaceSectionSizingDefinition = Pick<ResolvedSectionDefinition, "contentSizing" | "resize">;

const UNSNAPPED_KEYBOARD_INCREMENT = 10;
const dimensionAxes = ["height", "width"] as const;

function axisEnabled(
  definition: WorkspaceSectionSizingDefinition,
  axis: WorkspaceSectionResizeAxis,
): boolean {
  const configuredAxes = definition.resize.axes;
  return (
    configuredAxes === "both" ||
    (axis === "height" ? configuredAxes === "vertical" : configuredAxes === "horizontal")
  );
}

export function workspaceSectionResizeHandles(
  definition: WorkspaceSectionSizingDefinition,
): readonly WorkspaceSectionResizeHandle[] {
  const handles: WorkspaceSectionResizeHandle[] = [];
  if (axisEnabled(definition, "width")) {
    handles.push("inline-end");
  }
  if (axisEnabled(definition, "height")) {
    handles.push("block-end");
  }
  if (definition.resize.axes === "both") {
    handles.push("corner");
  }
  return handles;
}

export function workspaceSectionResizeAxes(
  definition: WorkspaceSectionSizingDefinition,
  handle: WorkspaceSectionResizeHandle,
): readonly WorkspaceSectionResizeAxis[] {
  if (definition.resize.preserveAspectRatio) {
    return dimensionAxes;
  }
  if (handle === "inline-end") {
    return ["width"];
  }
  if (handle === "block-end") {
    return ["height"];
  }
  return dimensionAxes;
}

export function workspaceSectionContentAxes(
  definition: WorkspaceSectionSizingDefinition,
  handle: WorkspaceSectionResizeHandle,
): readonly WorkspaceSectionResizeAxis[] {
  const handleAxes: readonly WorkspaceSectionResizeAxis[] =
    handle === "inline-end" ? ["width"] : handle === "block-end" ? ["height"] : dimensionAxes;
  return handleAxes.filter((axis) => definition.contentSizing[axis]);
}

export function workspaceSectionResizeBounds(definition: WorkspaceSectionSizingDefinition) {
  return {
    maxHeight: definition.resize.maxSize.height ?? Number.MAX_VALUE,
    maxWidth: definition.resize.maxSize.width ?? Number.MAX_VALUE,
    minHeight: definition.resize.minSize.height ?? 1,
    minWidth: definition.resize.minSize.width ?? 1,
  } as const;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function nextGridValue(current: number, spacing: number, direction: -1 | 1): number {
  const index =
    direction === 1 ? Math.floor(current / spacing) + 1 : Math.ceil(current / spacing) - 1;
  return index * spacing;
}

function nextKeyboardValue(
  current: number,
  spacing: number,
  direction: -1 | 1,
  snap: boolean,
): number {
  return snap
    ? nextGridValue(current, spacing, direction)
    : current + direction * UNSNAPPED_KEYBOARD_INCREMENT;
}

type KeyboardResizeIntent = Readonly<{
  axis: WorkspaceSectionResizeAxis;
  direction: -1 | 1;
}>;

function blockKeyboardResizeIntent(
  handle: WorkspaceSectionResizeHandle,
  key: string,
): KeyboardResizeIntent | null {
  if (handle === "inline-end") {
    return null;
  }
  if (key === "ArrowDown") {
    return { axis: "height", direction: 1 };
  }
  if (key === "ArrowUp") {
    return { axis: "height", direction: -1 };
  }
  return null;
}

function inlineKeyboardResizeIntent(
  handle: WorkspaceSectionResizeHandle,
  inlineEnd: WorkspaceSectionInlineEnd,
  key: string,
): KeyboardResizeIntent | null {
  if (handle === "block-end" || (key !== "ArrowLeft" && key !== "ArrowRight")) {
    return null;
  }
  const grows = key === (inlineEnd === "right" ? "ArrowRight" : "ArrowLeft");
  return { axis: "width", direction: grows ? 1 : -1 };
}

function keyboardResizeIntent(
  handle: WorkspaceSectionResizeHandle,
  inlineEnd: WorkspaceSectionInlineEnd,
  key: string,
): KeyboardResizeIntent | null {
  return (
    blockKeyboardResizeIntent(handle, key) ?? inlineKeyboardResizeIntent(handle, inlineEnd, key)
  );
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function aspectRatioSize(
  current: WorkspaceSectionMeasuredSize,
  intent: KeyboardResizeIntent,
  nextValue: number,
  bounds: ReturnType<typeof workspaceSectionResizeBounds>,
): WorkspaceSectionMeasuredSize {
  const ratio = current.width / current.height;
  if (intent.axis === "width") {
    const minimum = Math.max(bounds.minWidth, bounds.minHeight * ratio);
    const maximum = Math.min(bounds.maxWidth, bounds.maxHeight * ratio);
    const width = clamp(nextValue, minimum, maximum);
    return { height: rounded(width / ratio), width: rounded(width) };
  }
  const minimum = Math.max(bounds.minHeight, bounds.minWidth / ratio);
  const maximum = Math.min(bounds.maxHeight, bounds.maxWidth / ratio);
  const height = clamp(nextValue, minimum, maximum);
  return { height: rounded(height), width: rounded(height * ratio) };
}

function independentSize(
  current: WorkspaceSectionMeasuredSize,
  intent: KeyboardResizeIntent,
  nextValue: number,
  bounds: ReturnType<typeof workspaceSectionResizeBounds>,
): WorkspaceSectionMeasuredSize {
  return intent.axis === "width"
    ? { ...current, width: clamp(nextValue, bounds.minWidth, bounds.maxWidth) }
    : { ...current, height: clamp(nextValue, bounds.minHeight, bounds.maxHeight) };
}

export function resizeWorkspaceSectionWithKeyboard({
  current,
  definition,
  gridOptions,
  handle,
  inlineEnd,
  key,
  position,
}: Readonly<{
  current: WorkspaceSectionMeasuredSize;
  definition: WorkspaceSectionSizingDefinition;
  gridOptions: Pick<ResolvedWorkspaceGridOptions, "snap" | "spacing">;
  handle: WorkspaceSectionResizeHandle;
  inlineEnd: WorkspaceSectionInlineEnd;
  key: string;
  position: WorkspacePoint;
}>): WorkspaceRootResizeSnapshot | null {
  const intent = keyboardResizeIntent(handle, inlineEnd, key);
  if (!intent || !workspaceSectionResizeAxes(definition, handle).includes(intent.axis)) {
    return null;
  }
  const currentValue = current[intent.axis];
  const spacing = gridOptions.spacing[intent.axis === "width" ? 0 : 1];
  const nextValue = nextKeyboardValue(currentValue, spacing, intent.direction, gridOptions.snap);
  const bounds = workspaceSectionResizeBounds(definition);
  const size = definition.resize.preserveAspectRatio
    ? aspectRatioSize(current, intent, nextValue, bounds)
    : independentSize(current, intent, nextValue, bounds);
  if (size.width === current.width && size.height === current.height) {
    return null;
  }
  const x =
    inlineEnd === "left" && size.width !== current.width
      ? position.x - (size.width - current.width)
      : position.x;
  return { position: { x, y: position.y }, size };
}

export function workspaceSectionSizeModeLabel(axes: readonly WorkspaceSectionResizeAxis[]): string {
  if (axes.length === 2) {
    return "width and height";
  }
  return axes[0] ?? "size";
}

export function workspaceSectionMeasuredSize(
  section: WorkspaceSection<unknown>,
  measured: WorkspaceSectionMeasuredSize | undefined,
): WorkspaceSectionMeasuredSize {
  return {
    height: measured?.height ?? section.size.height.value,
    width: measured?.width ?? section.size.width.value,
  };
}
