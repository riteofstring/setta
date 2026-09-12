import {
  Ellipse,
  Line,
  Point,
  Polyline,
  Rect,
  type FabricObject,
} from "fabric";

export type DrawingPlacementTool =
  "arrow" | "ellipse" | "line" | "rectangle" | "text";

type DrawingShapeTool = Exclude<DrawingPlacementTool, "text">;

type DrawingShapePlacementStyle = Readonly<{
  fill: string;
  stroke: string;
}>;

export type DrawingShapePlacement = {
  end: Point;
  object: FabricObject;
  start: Point;
  tool: DrawingShapeTool;
};

const DRAWING_PLACEMENT_MINIMUM_LENGTH = 3;
const DRAWING_SHAPE_TOOLS = new Set<string>([
  "arrow",
  "ellipse",
  "line",
  "rectangle",
]);

export function isDrawingShapeTool(tool: string): tool is DrawingShapeTool {
  return DRAWING_SHAPE_TOOLS.has(tool);
}

function arrowPoints(
  start: Point,
  end: Point,
): Array<{ x: number; y: number }> {
  const delta = end.subtract(start);
  const length = Math.max(Math.hypot(delta.x, delta.y), 1);
  const unitX = delta.x / length;
  const unitY = delta.y / length;
  const headLength = Math.min(18, Math.max(8, length * 0.3));
  const headWidth = headLength * 0.55;
  const baseX = end.x - unitX * headLength;
  const baseY = end.y - unitY * headLength;
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
    { x: baseX - unitY * headWidth, y: baseY + unitX * headWidth },
    { x: end.x, y: end.y },
    { x: baseX + unitY * headWidth, y: baseY - unitX * headWidth },
  ];
}

export function createDrawingShapePlacement(
  tool: DrawingShapeTool,
  start: Point,
  style: DrawingShapePlacementStyle = {
    fill: "rgba(37, 99, 235, 0.12)",
    stroke: tool === "line" || tool === "arrow" ? "#111827" : "#2563eb",
  },
): DrawingShapePlacement {
  const end = start.add(new Point(1, 1));
  let object: FabricObject;
  if (tool === "rectangle") {
    object = new Rect({
      fill: style.fill,
      height: 1,
      left: start.x,
      originX: "left",
      originY: "top",
      stroke: style.stroke,
      strokeWidth: 2,
      top: start.y,
      width: 1,
    });
  } else if (tool === "ellipse") {
    object = new Ellipse({
      fill: style.fill,
      left: start.x,
      originX: "left",
      originY: "top",
      rx: 0.5,
      ry: 0.5,
      stroke: style.stroke,
      strokeWidth: 2,
      top: start.y,
    });
  } else if (tool === "line") {
    object = new Line([start.x, start.y, end.x, end.y], {
      stroke: style.stroke,
      strokeLineCap: "round",
      strokeWidth: 3,
    });
  } else {
    object = new Polyline(arrowPoints(start, end), {
      fill: null,
      stroke: style.stroke,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeWidth: 3,
    });
  }
  object.set({ evented: false, selectable: false });
  return { end, object, start, tool };
}

export function updateDrawingShapePlacement(
  placement: DrawingShapePlacement,
  end: Point,
): void {
  placement.end = end;
  const { object, start, tool } = placement;
  if (tool === "rectangle" && object instanceof Rect) {
    object.set({
      height: Math.abs(end.y - start.y),
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
    });
  } else if (tool === "ellipse" && object instanceof Ellipse) {
    object.set({
      left: Math.min(start.x, end.x),
      rx: Math.abs(end.x - start.x) / 2,
      ry: Math.abs(end.y - start.y) / 2,
      top: Math.min(start.y, end.y),
    });
  } else if (tool === "line" && object instanceof Line) {
    object.set({ x1: start.x, x2: end.x, y1: start.y, y2: end.y });
  } else if (tool === "arrow" && object instanceof Polyline) {
    object.points = arrowPoints(start, end);
    object.setBoundingBox(true);
  }
  object.setCoords();
}

export function isMeaningfulDrawingShapePlacement(
  placement: DrawingShapePlacement,
): boolean {
  return (
    Math.hypot(
      placement.end.x - placement.start.x,
      placement.end.y - placement.start.y,
    ) >= DRAWING_PLACEMENT_MINIMUM_LENGTH
  );
}
