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

type Box = {
  height: number;
  left: number;
  top: number;
  width: number;
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

export function isDrawingObjectLocked(object: FabricObject): boolean {
  return (
    DRAWING_OBJECT_SERIALIZATION_PROPERTIES.some(
      (property) => object[property],
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

export function createDrawingSelectionSnapshot(
  canvas: Canvas,
  options: SelectionCapabilityOptions,
): DrawingSelectionSnapshot {
  const objects = selectedDrawingObjects(canvas);
  const canvasObjects = canvas.getObjects();
  const selected = new Set(objects);
  const unlocked =
    objects.length > 0 &&
    objects.every((object) => !isDrawingObjectLocked(object));
  const fillSupported = objects.length > 0 && objects.every(supportsFill);
  const strokeSupported = objects.length > 0 && objects.every(supportsStroke);
  const typographySupported =
    objects.length > 0 && objects.every((object) => object instanceof IText);
  const cornerRadiusSupported =
    objects.length > 0 && objects.every((object) => object instanceof Rect);
  const snapshot: DrawingSelectionSnapshot = {
    canAlign: objects.length >= 2 && unlocked,
    canClearSelection: objects.length > 0,
    canCopy: objects.length > 0,
    canDelete: objects.length > 0 && unlocked,
    canDistribute: objects.length >= 3 && unlocked,
    canDuplicate: objects.length > 0 && unlocked,
    canGroup: objects.length >= 2 && unlocked,
    canLock: objects.length > 0,
    canMoveBackward: unlocked && canMoveBackward(canvasObjects, selected),
    canMoveForward: unlocked && canMoveForward(canvasObjects, selected),
    canPaste: options.canPaste,
    canSelectAll:
      canvasObjects.length > 0 && objects.length !== canvasObjects.length,
    canUngroup: objects.length === 1 && objects[0] instanceof Group && unlocked,
    cornerRadius: cornerRadiusSupported
      ? selectionValue(objects, (object) => (object as Rect).rx)
      : null,
    count: objects.length,
    fillColor: fillSupported
      ? selectionValue(objects, (object) => paintColor(object.fill))
      : null,
    fillEnabled: fillSupported
      ? selectionValue(objects, (object) => paintEnabled(object.fill))
      : null,
    fontFamily: typographySupported
      ? selectionValue(objects, (object) => (object as IText).fontFamily)
      : null,
    fontSize: typographySupported
      ? selectionValue(objects, (object) => (object as IText).fontSize)
      : null,
    fontStyle: typographySupported
      ? selectionValue(objects, (object) =>
          (object as IText).fontStyle === "italic" ? "italic" : "normal",
        )
      : null,
    fontWeight: typographySupported
      ? selectionValue(objects, (object) =>
          (object as IText).fontWeight === "bold" ||
          Number((object as IText).fontWeight) >= 600
            ? "bold"
            : "normal",
        )
      : null,
    kind: selectionKind(objects),
    locked:
      objects.length > 0
        ? selectionValue(objects, isDrawingObjectLocked)
        : null,
    opacity:
      objects.length > 0
        ? selectionValue(objects, (object) => object.opacity)
        : null,
    strokeColor: strokeSupported
      ? selectionValue(objects, (object) => paintColor(object.stroke))
      : null,
    strokeEnabled: strokeSupported
      ? selectionValue(objects, (object) => paintEnabled(object.stroke))
      : null,
    strokeWidth: strokeSupported
      ? selectionValue(objects, (object) => object.strokeWidth)
      : null,
    supportsCornerRadius: cornerRadiusSupported,
    supportsFill: fillSupported,
    supportsStroke: strokeSupported,
    supportsTypography: typographySupported,
    textAlign: typographySupported
      ? selectionValue(objects, (object) => {
          const align = (object as IText).textAlign;
          return align === "center" || align === "right" || align === "justify"
            ? align
            : "left";
        })
      : null,
  };
  return Object.freeze(snapshot);
}

function validColor(value: string | null): boolean {
  return value === null || value.trim().length > 0;
}

export function isDrawingAppearancePatchValid(
  patch: DrawingSelectionAppearancePatch,
): boolean {
  return (
    (patch.fill === undefined || validColor(patch.fill)) &&
    (patch.stroke === undefined || validColor(patch.stroke)) &&
    (patch.opacity === undefined ||
      (Number.isFinite(patch.opacity) &&
        patch.opacity >= 0 &&
        patch.opacity <= 1)) &&
    (patch.strokeWidth === undefined ||
      (Number.isFinite(patch.strokeWidth) && patch.strokeWidth >= 0)) &&
    (patch.cornerRadius === undefined ||
      (Number.isFinite(patch.cornerRadius) && patch.cornerRadius >= 0))
  );
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
    let objectChanged = false;
    if (
      patch.fill !== undefined &&
      supportsFill(object) &&
      object.fill !== patch.fill
    ) {
      object.set("fill", patch.fill);
      objectChanged = true;
    }
    if (
      patch.stroke !== undefined &&
      supportsStroke(object) &&
      object.stroke !== patch.stroke
    ) {
      object.set("stroke", patch.stroke);
      objectChanged = true;
    }
    if (
      patch.strokeWidth !== undefined &&
      supportsStroke(object) &&
      object.strokeWidth !== patch.strokeWidth
    ) {
      object.set("strokeWidth", patch.strokeWidth);
      objectChanged = true;
    }
    if (patch.opacity !== undefined && object.opacity !== patch.opacity) {
      object.set("opacity", patch.opacity);
      objectChanged = true;
    }
    if (patch.cornerRadius !== undefined && object instanceof Rect) {
      if (
        object.rx !== patch.cornerRadius ||
        object.ry !== patch.cornerRadius
      ) {
        object.set({ rx: patch.cornerRadius, ry: patch.cornerRadius });
        objectChanged = true;
      }
    }
    if (objectChanged) {
      object.setCoords();
      changed = true;
    }
  }
  return changed;
}

export function isDrawingTypographyPatchValid(
  patch: DrawingSelectionTypographyPatch,
): boolean {
  return (
    (patch.fontFamily === undefined || patch.fontFamily.trim().length > 0) &&
    (patch.fontSize === undefined ||
      (Number.isFinite(patch.fontSize) && patch.fontSize > 0))
  );
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
    if (!(object instanceof IText)) {
      continue;
    }
    const next: Partial<IText> = {};
    if (
      patch.fontFamily !== undefined &&
      object.fontFamily !== patch.fontFamily
    ) {
      next.fontFamily = patch.fontFamily;
    }
    if (patch.fontSize !== undefined && object.fontSize !== patch.fontSize) {
      next.fontSize = patch.fontSize;
    }
    if (patch.fontStyle !== undefined && object.fontStyle !== patch.fontStyle) {
      next.fontStyle = patch.fontStyle;
    }
    if (
      patch.fontWeight !== undefined &&
      object.fontWeight !== patch.fontWeight
    ) {
      next.fontWeight = patch.fontWeight;
    }
    if (patch.textAlign !== undefined && object.textAlign !== patch.textAlign) {
      next.textAlign = patch.textAlign;
    }
    if (Object.keys(next).length > 0) {
      object.set(next);
      object.initDimensions();
      object.setCoords();
      changed = true;
    }
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
  const horizontal = distribution === "horizontal";
  const sorted = [...objects].sort((first, second) => {
    const firstBox = boxes.get(first)!;
    const secondBox = boxes.get(second)!;
    return horizontal
      ? firstBox.left - secondBox.left
      : firstBox.top - secondBox.top;
  });
  const firstBox = boxes.get(sorted[0]!)!;
  const lastBox = boxes.get(sorted[sorted.length - 1]!)!;
  const totalSize = sorted.reduce((sum, object) => {
    const box = boxes.get(object)!;
    return sum + (horizontal ? box.width : box.height);
  }, 0);
  const start = horizontal ? firstBox.left : firstBox.top;
  const end = horizontal
    ? lastBox.left + lastBox.width
    : lastBox.top + lastBox.height;
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  let changed = false;
  for (const object of sorted) {
    const box = boxes.get(object)!;
    const current = horizontal ? box.left : box.top;
    changed =
      moveObject(
        object,
        horizontal ? cursor - current : 0,
        horizontal ? 0 : cursor - current,
      ) || changed;
    cursor += (horizontal ? box.width : box.height) + gap;
  }
  return changed;
}
