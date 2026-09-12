import {
  ActiveSelection,
  Canvas,
  Ellipse,
  FabricImage,
  Group,
  IText,
  Line,
  Path,
  Point,
  Polyline,
  Rect,
  Textbox,
  type FabricObject,
} from "fabric";

export type DrawingSelectionValue<Value> = Value | "mixed" | null;

export type DrawingSelectionKind =
  | "none"
  | "ellipse"
  | "group"
  | "image"
  | "line"
  | "arrow"
  | "object"
  | "rectangle"
  | "stroke"
  | "text"
  | "mixed";

export type DrawingSelectionSnapshot = Readonly<{
  canAlign: boolean;
  canClearSelection: boolean;
  canCopy: boolean;
  canDelete: boolean;
  canDistribute: boolean;
  canDuplicate: boolean;
  canGroup: boolean;
  canLock: boolean;
  canMoveBackward: boolean;
  canMoveForward: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
  canUngroup: boolean;
  cornerRadius: DrawingSelectionValue<number>;
  count: number;
  fillColor: DrawingSelectionValue<string>;
  fillEnabled: DrawingSelectionValue<boolean>;
  fontFamily: DrawingSelectionValue<string>;
  fontSize: DrawingSelectionValue<number>;
  fontStyle: DrawingSelectionValue<"italic" | "normal">;
  fontWeight: DrawingSelectionValue<"bold" | "normal">;
  kind: DrawingSelectionKind;
  locked: DrawingSelectionValue<boolean>;
  opacity: DrawingSelectionValue<number>;
  strokeColor: DrawingSelectionValue<string>;
  strokeEnabled: DrawingSelectionValue<boolean>;
  strokeWidth: DrawingSelectionValue<number>;
  supportsCornerRadius: boolean;
  supportsFill: boolean;
  supportsStroke: boolean;
  supportsTypography: boolean;
  textAlign: DrawingSelectionValue<DrawingTextAlign>;
}>;

export type DrawingSelectionAppearancePatch = {
  cornerRadius?: number;
  fill?: string | null;
  opacity?: number;
  stroke?: string | null;
  strokeWidth?: number;
};

export type DrawingTextAlign = "center" | "justify" | "left" | "right";

export type DrawingSelectionTypographyPatch = {
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: "italic" | "normal";
  fontWeight?: "bold" | "normal";
  textAlign?: DrawingTextAlign;
};

export type DrawingAlignment =
  "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";

export type DrawingDistribution = "horizontal" | "vertical";

type SelectionCapabilityOptions = {
  canPaste: boolean;
};

type DrawingSelectionContext = {
  canvasObjects: FabricObject[];
  hasSelection: boolean;
  objects: FabricObject[];
  selected: Set<FabricObject>;
  supportsCornerRadius: boolean;
  supportsFill: boolean;
  supportsStroke: boolean;
  supportsTypography: boolean;
  unlocked: boolean;
};

type Box = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type DrawingDistributionAxis = {
  move: (object: FabricObject, offset: number) => boolean;
  position: (box: Box) => number;
  size: (box: Box) => number;
};

export const DRAWING_OBJECT_SERIALIZATION_PROPERTIES = [
  "lockMovementX",
  "lockMovementY",
  "lockRotation",
  "lockScalingFlip",
  "lockScalingX",
  "lockScalingY",
  "lockSkewingX",
  "lockSkewingY",
] as const;

const DRAWING_DISTRIBUTION_AXES: Record<
  DrawingDistribution,
  DrawingDistributionAxis
> = {
  horizontal: {
    move: (object, offset) => moveObject(object, offset, 0),
    position: (box) => box.left,
    size: (box) => box.width,
  },
  vertical: {
    move: (object, offset) => moveObject(object, 0, offset),
    position: (box) => box.top,
    size: (box) => box.height,
  },
};

function selectionValue<Value>(
  objects: FabricObject[],
  read: (object: FabricObject) => Value,
): DrawingSelectionValue<Value> {
  const first = objects[0];
  if (first === undefined) {
    return null;
  }
  const value = read(first);
  return objects.slice(1).every((object) => Object.is(read(object), value))
    ? value
    : "mixed";
}

function paintEnabled(value: FabricObject["fill"]): boolean {
  return value !== null && value !== undefined && value !== "";
}

function paintColor(value: FabricObject["fill"]): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function supportsFill(object: FabricObject): boolean {
  return (
    object instanceof Rect ||
    object instanceof Ellipse ||
    object instanceof IText
  );
}

function supportsStroke(object: FabricObject): boolean {
  return (
    object instanceof Rect ||
    object instanceof Ellipse ||
    object instanceof IText ||
    object instanceof Line ||
    object instanceof Polyline ||
    object instanceof Path
  );
}

function drawingObjectKind(object: FabricObject): DrawingSelectionKind {
  if (object instanceof Group) {
    return "group";
  }
  if (object instanceof IText) {
    return "text";
  }
  if (object instanceof Rect) {
    return "rectangle";
  }
  if (object instanceof Ellipse) {
    return "ellipse";
  }
  if (object instanceof Line) {
    return "line";
  }
  if (object instanceof Polyline) {
    return "arrow";
  }
  if (object instanceof Path) {
    return "stroke";
  }
  if (object instanceof FabricImage) {
    return "image";
  }
  return "object";
}

function selectionKind(objects: FabricObject[]): DrawingSelectionKind {
  const first = objects[0];
  if (first === undefined) {
    return "none";
  }
  const kind = drawingObjectKind(first);
  return objects.slice(1).every((object) => drawingObjectKind(object) === kind)
    ? kind
    : "mixed";
}

function isImplicitTextLock(
  object: FabricObject,
  property: (typeof DRAWING_OBJECT_SERIALIZATION_PROPERTIES)[number],
): boolean {
  return (
    object instanceof Textbox &&
    (property === "lockScalingFlip" ||
      (object.isEditing &&
        (property === "lockMovementX" || property === "lockMovementY")))
  );
}

export function isDrawingObjectLocked(object: FabricObject): boolean {
  return (
    DRAWING_OBJECT_SERIALIZATION_PROPERTIES.some(
      (property) => object[property] && !isImplicitTextLock(object, property),
    ) ||
    (object instanceof Group && object.getObjects().some(isDrawingObjectLocked))
  );
}

export function selectedDrawingObjects(canvas: Canvas): FabricObject[] {
  return canvas.getActiveObjects().filter((object) => canvas.contains(object));
}

function setDrawingObjectInteractionLocked(
  object: FabricObject,
  locked: boolean,
): boolean {
  if (
    DRAWING_OBJECT_SERIALIZATION_PROPERTIES.every(
      (property) => object[property] === locked,
    )
  ) {
    return false;
  }
  object.set(
    Object.fromEntries(
      DRAWING_OBJECT_SERIALIZATION_PROPERTIES.map((property) => [
        property,
        locked,
      ]),
    ),
  );
  return true;
}

export function synchronizeDrawingSelectionLock(canvas: Canvas): void {
  const active = canvas.getActiveObject();
  if (active instanceof ActiveSelection) {
    setDrawingObjectInteractionLocked(
      active,
      active.getObjects().some(isDrawingObjectLocked),
    );
  } else if (active !== undefined && isDrawingObjectLocked(active)) {
    setDrawingObjectInteractionLocked(active, true);
  }
}

function canMoveForward(
  canvasObjects: FabricObject[],
  selected: Set<FabricObject>,
): boolean {
  let unselectedAbove = false;
  for (let index = canvasObjects.length - 1; index >= 0; index -= 1) {
    const object = canvasObjects[index]!;
    if (selected.has(object)) {
      if (unselectedAbove) {
        return true;
      }
    } else {
      unselectedAbove = true;
    }
  }
  return false;
}

function canMoveBackward(
  canvasObjects: FabricObject[],
  selected: Set<FabricObject>,
): boolean {
  let unselectedBelow = false;
  for (const object of canvasObjects) {
    if (selected.has(object)) {
      if (unselectedBelow) {
        return true;
      }
    } else {
      unselectedBelow = true;
    }
  }
  return false;
}

function selectedObjectsSupport(
  objects: FabricObject[],
  predicate: (object: FabricObject) => boolean,
): boolean {
  return objects.length > 0 && objects.every(predicate);
}

function createDrawingSelectionContext(
  canvas: Canvas,
): DrawingSelectionContext {
  const objects = selectedDrawingObjects(canvas);
  return {
    canvasObjects: canvas.getObjects(),
    hasSelection: objects.length > 0,
    objects,
    selected: new Set(objects),
    supportsCornerRadius: selectedObjectsSupport(
      objects,
      (object) => object instanceof Rect,
    ),
    supportsFill: selectedObjectsSupport(objects, supportsFill),
    supportsStroke: selectedObjectsSupport(objects, supportsStroke),
    supportsTypography: selectedObjectsSupport(
      objects,
      (object) => object instanceof IText,
    ),
    unlocked: selectedObjectsSupport(
      objects,
      (object) => !isDrawingObjectLocked(object),
    ),
  };
}

function selectionCapabilities(
  context: DrawingSelectionContext,
  options: SelectionCapabilityOptions,
): Pick<
  DrawingSelectionSnapshot,
  | "canAlign"
  | "canClearSelection"
  | "canCopy"
  | "canDelete"
  | "canDistribute"
  | "canDuplicate"
  | "canGroup"
  | "canLock"
  | "canMoveBackward"
  | "canMoveForward"
  | "canPaste"
  | "canSelectAll"
  | "canUngroup"
> {
  const multipleUnlocked = context.unlocked && context.objects.length >= 2;
  return {
    canAlign: multipleUnlocked,
    canClearSelection: context.hasSelection,
    canCopy: context.hasSelection,
    canDelete: context.unlocked,
    canDistribute: context.unlocked && context.objects.length >= 3,
    canDuplicate: context.unlocked,
    canGroup: multipleUnlocked,
    canLock: context.hasSelection,
    canMoveBackward:
      context.unlocked &&
      canMoveBackward(context.canvasObjects, context.selected),
    canMoveForward:
      context.unlocked &&
      canMoveForward(context.canvasObjects, context.selected),
    canPaste: options.canPaste,
    canSelectAll:
      context.canvasObjects.length > 0 &&
      context.objects.length !== context.canvasObjects.length,
    canUngroup:
      context.unlocked &&
      context.objects.length === 1 &&
      context.objects[0] instanceof Group,
  };
}

function supportedSelectionValue<Value>(
  supported: boolean,
  objects: FabricObject[],
  read: (object: FabricObject) => Value,
): DrawingSelectionValue<Value> {
  return supported ? selectionValue(objects, read) : null;
}

function normalizedFontStyle(object: FabricObject): "italic" | "normal" {
  return (object as IText).fontStyle === "italic" ? "italic" : "normal";
}

function normalizedFontWeight(object: FabricObject): "bold" | "normal" {
  const weight = (object as IText).fontWeight;
  return weight === "bold" || Number(weight) >= 600 ? "bold" : "normal";
}

function normalizedTextAlign(object: FabricObject): DrawingTextAlign {
  const align = (object as IText).textAlign;
  return align === "center" || align === "right" || align === "justify"
    ? align
    : "left";
}

function selectionAppearance(
  context: DrawingSelectionContext,
): Pick<
  DrawingSelectionSnapshot,
  | "cornerRadius"
  | "fillColor"
  | "fillEnabled"
  | "opacity"
  | "strokeColor"
  | "strokeEnabled"
  | "strokeWidth"
  | "supportsCornerRadius"
  | "supportsFill"
  | "supportsStroke"
> {
  return {
    cornerRadius: supportedSelectionValue(
      context.supportsCornerRadius,
      context.objects,
      (object) => (object as Rect).rx,
    ),
    fillColor: supportedSelectionValue(
      context.supportsFill,
      context.objects,
      (object) => paintColor(object.fill),
    ),
    fillEnabled: supportedSelectionValue(
      context.supportsFill,
      context.objects,
      (object) => paintEnabled(object.fill),
    ),
    opacity: supportedSelectionValue(
      context.hasSelection,
      context.objects,
      (object) => object.opacity,
    ),
    strokeColor: supportedSelectionValue(
      context.supportsStroke,
      context.objects,
      (object) => paintColor(object.stroke),
    ),
    strokeEnabled: supportedSelectionValue(
      context.supportsStroke,
      context.objects,
      (object) => paintEnabled(object.stroke),
    ),
    strokeWidth: supportedSelectionValue(
      context.supportsStroke,
      context.objects,
      (object) => object.strokeWidth,
    ),
    supportsCornerRadius: context.supportsCornerRadius,
    supportsFill: context.supportsFill,
    supportsStroke: context.supportsStroke,
  };
}

function selectionTypography(
  context: DrawingSelectionContext,
): Pick<
  DrawingSelectionSnapshot,
  | "fontFamily"
  | "fontSize"
  | "fontStyle"
  | "fontWeight"
  | "supportsTypography"
  | "textAlign"
> {
  return {
    fontFamily: supportedSelectionValue(
      context.supportsTypography,
      context.objects,
      (object) => (object as IText).fontFamily,
    ),
    fontSize: supportedSelectionValue(
      context.supportsTypography,
      context.objects,
      (object) => (object as IText).fontSize,
    ),
    fontStyle: supportedSelectionValue(
      context.supportsTypography,
      context.objects,
      normalizedFontStyle,
    ),
    fontWeight: supportedSelectionValue(
      context.supportsTypography,
      context.objects,
      normalizedFontWeight,
    ),
    supportsTypography: context.supportsTypography,
    textAlign: supportedSelectionValue(
      context.supportsTypography,
      context.objects,
      normalizedTextAlign,
    ),
  };
}

export function createDrawingSelectionSnapshot(
  canvas: Canvas,
  options: SelectionCapabilityOptions,
): DrawingSelectionSnapshot {
  const context = createDrawingSelectionContext(canvas);
  const snapshot: DrawingSelectionSnapshot = {
    ...selectionCapabilities(context, options),
    ...selectionAppearance(context),
    ...selectionTypography(context),
    count: context.objects.length,
    kind: selectionKind(context.objects),
    locked: supportedSelectionValue(
      context.hasSelection,
      context.objects,
      isDrawingObjectLocked,
    ),
  };
  return Object.freeze(snapshot);
}

function validColor(value: string | null): boolean {
  return value === null || value.trim().length > 0;
}

function validOptionalColor(value: string | null | undefined): boolean {
  return value === undefined ? true : validColor(value);
}

function validOptionalNumber(
  value: number | undefined,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): boolean {
  return value === undefined
    ? true
    : Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isDrawingAppearancePatchValid(
  patch: DrawingSelectionAppearancePatch,
): boolean {
  return [
    validOptionalColor(patch.fill),
    validOptionalColor(patch.stroke),
    validOptionalNumber(patch.opacity, 0, 1),
    validOptionalNumber(patch.strokeWidth, 0),
    validOptionalNumber(patch.cornerRadius, 0),
  ].every(Boolean);
}

function applyDrawingFill(
  object: FabricObject,
  fill: DrawingSelectionAppearancePatch["fill"],
): boolean {
  if (fill === undefined || !supportsFill(object) || object.fill === fill) {
    return false;
  }
  object.set("fill", fill);
  return true;
}

function applyDrawingStroke(
  object: FabricObject,
  stroke: DrawingSelectionAppearancePatch["stroke"],
): boolean {
  if (
    stroke === undefined ||
    !supportsStroke(object) ||
    object.stroke === stroke
  ) {
    return false;
  }
  object.set("stroke", stroke);
  return true;
}

function applyDrawingStrokeWidth(
  object: FabricObject,
  strokeWidth: DrawingSelectionAppearancePatch["strokeWidth"],
): boolean {
  if (
    strokeWidth === undefined ||
    !supportsStroke(object) ||
    object.strokeWidth === strokeWidth
  ) {
    return false;
  }
  object.set("strokeWidth", strokeWidth);
  return true;
}

function applyDrawingOpacity(
  object: FabricObject,
  opacity: DrawingSelectionAppearancePatch["opacity"],
): boolean {
  if (opacity === undefined || object.opacity === opacity) {
    return false;
  }
  object.set("opacity", opacity);
  return true;
}

function applyDrawingCornerRadius(
  object: FabricObject,
  cornerRadius: DrawingSelectionAppearancePatch["cornerRadius"],
): boolean {
  if (cornerRadius === undefined || !(object instanceof Rect)) {
    return false;
  }
  if (object.rx === cornerRadius && object.ry === cornerRadius) {
    return false;
  }
  object.set({ rx: cornerRadius, ry: cornerRadius });
  return true;
}

function applyDrawingObjectAppearance(
  object: FabricObject,
  patch: DrawingSelectionAppearancePatch,
): boolean {
  const changed = [
    applyDrawingFill(object, patch.fill),
    applyDrawingStroke(object, patch.stroke),
    applyDrawingStrokeWidth(object, patch.strokeWidth),
    applyDrawingOpacity(object, patch.opacity),
    applyDrawingCornerRadius(object, patch.cornerRadius),
  ].some(Boolean);
  if (changed) {
    object.setCoords();
  }
  return changed;
}

export function applyDrawingAppearance(
  objects: FabricObject[],
  patch: DrawingSelectionAppearancePatch,
): boolean {
  if (!isDrawingAppearancePatchValid(patch)) {
    return false;
  }
  let changed = false;
  for (const object of objects) {
    changed = applyDrawingObjectAppearance(object, patch) || changed;
  }
  return changed;
}

function isDrawingTypographyPatchValid(
  patch: DrawingSelectionTypographyPatch,
): boolean {
  return (
    (patch.fontFamily === undefined || patch.fontFamily.trim().length > 0) &&
    (patch.fontSize === undefined ||
      (Number.isFinite(patch.fontSize) && patch.fontSize > 0))
  );
}

function applyChangedValue<Value>(
  current: Value,
  value: Value | undefined,
  apply: (value: Value) => void,
): boolean {
  if (value === undefined || Object.is(current, value)) {
    return false;
  }
  apply(value);
  return true;
}

function applyDrawingObjectTypography(
  object: FabricObject,
  patch: DrawingSelectionTypographyPatch,
): boolean {
  if (!(object instanceof IText)) {
    return false;
  }
  const changes = [
    applyChangedValue(object.fontFamily, patch.fontFamily, (value) =>
      object.set("fontFamily", value),
    ),
    applyChangedValue(object.fontSize, patch.fontSize, (value) =>
      object.set("fontSize", value),
    ),
    applyChangedValue(object.fontStyle, patch.fontStyle, (value) =>
      object.set("fontStyle", value),
    ),
    applyChangedValue(object.fontWeight, patch.fontWeight, (value) =>
      object.set("fontWeight", value),
    ),
    applyChangedValue(object.textAlign, patch.textAlign, (value) =>
      object.set("textAlign", value),
    ),
  ];
  if (!changes.some(Boolean)) {
    return false;
  }
  object.initDimensions();
  object.setCoords();
  return true;
}

export function applyDrawingTypography(
  objects: FabricObject[],
  patch: DrawingSelectionTypographyPatch,
): boolean {
  if (!isDrawingTypographyPatchValid(patch)) {
    return false;
  }
  let changed = false;
  for (const object of objects) {
    changed = applyDrawingObjectTypography(object, patch) || changed;
  }
  return changed;
}

export function setDrawingObjectsLocked(
  objects: FabricObject[],
  locked: boolean,
): boolean {
  let changed = false;
  const pending = [...objects];
  const visited = new Set<FabricObject>();
  while (pending.length > 0) {
    const object = pending.shift()!;
    if (visited.has(object)) {
      continue;
    }
    visited.add(object);
    if (object instanceof Group) {
      pending.push(...object.getObjects());
    }
    changed = setDrawingObjectInteractionLocked(object, locked) || changed;
  }
  return changed;
}

export function restoreDrawingSelection(
  canvas: Canvas,
  objects: FabricObject[],
): void {
  if (objects.length === 1) {
    canvas.setActiveObject(objects[0]!);
  } else if (objects.length > 1) {
    canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
  }
}

function selectionBoxes(objects: FabricObject[]): Map<FabricObject, Box> {
  return new Map(
    objects.map((object) => [object, object.getBoundingRect()] as const),
  );
}

function selectionBounds(boxes: Iterable<Box>): Box {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.left + box.width);
    bottom = Math.max(bottom, box.top + box.height);
  }
  return { height: bottom - top, left, top, width: right - left };
}

function moveObject(object: FabricObject, x: number, y: number): boolean {
  if (x === 0 && y === 0) {
    return false;
  }
  object.setXY(object.getXY().add(new Point(x, y)));
  object.setCoords();
  return true;
}

export function alignDrawingObjects(
  objects: FabricObject[],
  alignment: DrawingAlignment,
): boolean {
  if (objects.length < 2) {
    return false;
  }
  const boxes = selectionBoxes(objects);
  const bounds = selectionBounds(boxes.values());
  let changed = false;
  for (const object of objects) {
    const box = boxes.get(object)!;
    let x = 0;
    let y = 0;
    if (alignment === "left") {
      x = bounds.left - box.left;
    } else if (alignment === "horizontal-center") {
      x = bounds.left + bounds.width / 2 - (box.left + box.width / 2);
    } else if (alignment === "right") {
      x = bounds.left + bounds.width - (box.left + box.width);
    } else if (alignment === "top") {
      y = bounds.top - box.top;
    } else if (alignment === "vertical-center") {
      y = bounds.top + bounds.height / 2 - (box.top + box.height / 2);
    } else {
      y = bounds.top + bounds.height - (box.top + box.height);
    }
    changed = moveObject(object, x, y) || changed;
  }
  return changed;
}

export function distributeDrawingObjects(
  objects: FabricObject[],
  distribution: DrawingDistribution,
): boolean {
  if (objects.length < 3) {
    return false;
  }
  const boxes = selectionBoxes(objects);
  const axis = DRAWING_DISTRIBUTION_AXES[distribution];
  const sorted = [...objects].sort((first, second) => {
    const firstBox = boxes.get(first)!;
    const secondBox = boxes.get(second)!;
    return axis.position(firstBox) - axis.position(secondBox);
  });
  const firstBox = boxes.get(sorted[0]!)!;
  const lastBox = boxes.get(sorted[sorted.length - 1]!)!;
  const totalSize = sorted.reduce(
    (sum, object) => sum + axis.size(boxes.get(object)!),
    0,
  );
  const start = axis.position(firstBox);
  const end = axis.position(lastBox) + axis.size(lastBox);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  let changed = false;
  for (const object of sorted) {
    const box = boxes.get(object)!;
    changed = axis.move(object, cursor - axis.position(box)) || changed;
    cursor += axis.size(box) + gap;
  }
  return changed;
}
