import { getSegmentAngle, getTransformedWidth } from "./eraserIntersection";
import { getCombinedTransformForStroke, getTransformedPoints } from "./utils";

function isPointOnStroke(x, y, stroke, transform) {
  const point = [x, y];
  const strokePoints = getTransformedPoints(stroke.points, transform);

  // Handle single point
  if (strokePoints.length === 1) {
    const width =
      (stroke.width || 1) *
      Math.max(transform.scaleX || 1, transform.scaleY || 1);
    return (
      Math.hypot(
        point[0] - strokePoints[0][0],
        point[1] - strokePoints[0][1],
      ) <=
      width / 2
    );
  }

  // Check each segment
  for (let i = 0; i < strokePoints.length - 1; i++) {
    const currentPoint = strokePoints[i];
    const nextPoint = strokePoints[i + 1];

    console.log("currentPoint, nextPoint", currentPoint, nextPoint);

    const segmentAngle = getSegmentAngle(currentPoint, nextPoint);
    console.log("segmentAngle", segmentAngle);
    const segmentWidth = getTransformedWidth(
      stroke.width || 1,
      segmentAngle,
      transform.scaleX || 1,
      transform.scaleY || 1,
    );

    // Calculate distance to line segment
    const dx = nextPoint[0] - currentPoint[0];
    const dy = nextPoint[1] - currentPoint[1];
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) continue;

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - currentPoint[0]) * dx +
          (point[1] - currentPoint[1]) * dy) /
          lengthSq,
      ),
    );

    const projX = currentPoint[0] + t * dx;
    const projY = currentPoint[1] + t * dy;
    const distance = Math.hypot(point[0] - projX, point[1] - projY);

    console.log("distance", distance);

    if (distance <= segmentWidth / 2) {
      return true;
    }
  }

  return false;
}

export function detectHit(x, y, artifact, transform) {
  for (let i = 0; i < artifact.value.length; i++) {
    const stroke = artifact.value[i];
    const combinedTransform = getCombinedTransformForStroke(
      transform,
      stroke.transform,
    );

    if (isPointOnStroke(x, y, stroke, combinedTransform)) {
      return true;
    }
  }

  return false;
}
