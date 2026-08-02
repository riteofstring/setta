import { DrawAreaTransform } from "utils/generatedTypes";
import {
  applyTransformToPoint,
  getIdentityTransform,
  invertTransform,
} from "./transformUtils";

export function getTransformedPoints(
  points: Array<[number, number]>,
  transform: DrawAreaTransform | null,
) {
  if (!transform) {
    return points;
  }
  return points.map((point) => applyTransformToPoint(transform, point));
}

export function isPointOnStroke(x, y, stroke, transform) {
  const inverse =
    transform !== null
      ? invertTransform(transform) ?? getIdentityTransform()
      : getIdentityTransform();
  const [localX, localY] = applyTransformToPoint(inverse, [x, y]);
  const halfWidth = stroke.lineWidth / 2;

  let prevPoint: [number, number] | null = null;
  for (const rawPoint of stroke.points) {
    if (rawPoint === "BREAK") {
      prevPoint = null;
      continue;
    }

    const point = rawPoint;

    if (!prevPoint) {
      const distance = Math.hypot(localX - point[0], localY - point[1]);
      if (distance <= halfWidth) {
        return true;
      }

      prevPoint = point;
      continue;
    }

    const dx = point[0] - prevPoint[0];
    const dy = point[1] - prevPoint[1];
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      prevPoint = point;
      continue;
    }

    const tNumerator =
      (localX - prevPoint[0]) * dx + (localY - prevPoint[1]) * dy;
    const t = Math.max(0, Math.min(1, tNumerator / lengthSq));

    const projX = prevPoint[0] + t * dx;
    const projY = prevPoint[1] + t * dy;
    const distance = Math.hypot(localX - projX, localY - projY);

    if (distance <= halfWidth) {
      return true;
    }

    prevPoint = point;
  }

  return false;
}
