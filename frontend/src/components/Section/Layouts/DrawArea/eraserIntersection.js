import { getSegmentAngle, getTransformedWidth } from "./lowLevelStrokeUtils";

// Shared utility functions
function createBounds(x, y, width, height, padding) {
  return {
    minX: x - padding,
    maxX: x + width + padding,
    minY: y - padding,
    maxY: y + height + padding,
  };
}

function addPaddingToBounds(bounds, padding) {
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minY: bounds.minY - padding,
    maxY: bounds.maxY + padding,
  };
}

function isPointInBounds(point, bounds) {
  return (
    point[0] >= bounds.minX &&
    point[0] <= bounds.maxX &&
    point[1] >= bounds.minY &&
    point[1] <= bounds.maxY
  );
}

function calculateCapPoint(point, referencePoint, halfWidth, capExtra) {
  const angle = Math.atan2(
    point[1] - referencePoint[1],
    point[0] - referencePoint[0],
  );
  return [
    point[0] + (halfWidth + capExtra) * Math.cos(angle),
    point[1] + (halfWidth + capExtra) * Math.sin(angle),
  ];
}

function isPointInBoundsWithLineCap(
  point,
  prevPoint,
  nextPoint,
  bounds,
  lineCap,
  halfWidth,
) {
  // Basic bounds check
  if (isPointInBounds(point, bounds)) {
    return true;
  }

  // For 'butt' cap, no additional checks needed
  if (lineCap === "butt") {
    return false;
  }

  // For 'round' or 'square' caps, check additional area
  const capExtra = lineCap === "square" ? halfWidth : 0;

  // If this is the start point and we have a next point
  if (!prevPoint && nextPoint) {
    const [capX, capY] = calculateCapPoint(
      nextPoint,
      point,
      halfWidth,
      capExtra,
    );
    return isPointInBounds([capX, capY], bounds);
  }

  // If this is the end point and we have a previous point
  if (!nextPoint && prevPoint) {
    const [capX, capY] = calculateCapPoint(
      point,
      prevPoint,
      halfWidth,
      capExtra,
    );
    return isPointInBounds([capX, capY], bounds);
  }

  return false;
}

function filterPointsWithBounds(pathPoints, bounds, lineCap, lineWidth) {
  if (!pathPoints || pathPoints.length === 0) {
    return [];
  }

  const halfWidth = lineWidth / 2;
  const result = [];
  let includeNext = false;

  for (let i = 0; i < pathPoints.length; i++) {
    const point = pathPoints[i];
    const prevPoint = i > 0 ? pathPoints[i - 1] : null;
    const nextPoint = i < pathPoints.length - 1 ? pathPoints[i + 1] : null;

    const isInBounds = isPointInBoundsWithLineCap(
      point,
      prevPoint,
      nextPoint,
      bounds,
      lineCap,
      halfWidth,
    );

    if (isInBounds) {
      if (i > 0 && result.length === 0) {
        // Include the previous point when entering bounds
        result.push(pathPoints[i - 1]);
      }
      result.push(point);
      includeNext = true;
    } else if (includeNext) {
      // Include one point after exiting bounds
      result.push(point);
      includeNext = false;
    }
  }

  return result;
}

export function filterPathForImage(
  pathPoints,
  lineWidth,
  lineCap,
  imageBounds,
) {
  if (!pathPoints || pathPoints.length === 0) {
    return [];
  }

  const halfWidth = lineWidth / 2;
  const paddedImagedBounds = addPaddingToBounds(imageBounds, halfWidth);

  return filterPointsWithBounds(
    pathPoints,
    paddedImagedBounds,
    lineCap,
    lineWidth,
  );
}

export function filterPathForBrushStroke(
  eraserPoints,
  eraserWidth,
  eraserCap,
  brushPoints,
  brushWidth,
  brushCap,
  scaleX,
  scaleY,
) {
  if (
    !eraserPoints ||
    eraserPoints.length === 0 ||
    !brushPoints ||
    brushPoints.length === 0
  ) {
    return [];
  }

  // Calculate the maximum possible intersection area
  const eraserHalfWidth = eraserWidth / 2;
  // Calculate maximum transformed brush width
  let maxBrushWidth = 0;

  for (let i = 0; i < brushPoints.length - 1; i++) {
    const angle = getSegmentAngle(brushPoints[i], brushPoints[i + 1]);
    const transformedWidth = getTransformedWidth(
      brushWidth,
      angle,
      scaleX,
      scaleY,
    );
    maxBrushWidth = Math.max(maxBrushWidth, transformedWidth);
  }

  // If there's only one point or we need to handle caps
  if (brushPoints.length === 1 || brushCap !== "butt") {
    // For a single point or caps, we need to consider the maximum possible width
    // in any direction
    const maxScale = Math.max(scaleX, scaleY);
    maxBrushWidth = Math.max(maxBrushWidth, brushWidth * maxScale);
  }

  const brushHalfWidth = maxBrushWidth / 2;
  const totalWidth = eraserHalfWidth + brushHalfWidth;

  // Find the bounds of the brush stroke, including caps
  const brushBounds = brushPoints.reduce(
    (bounds, point, i) => {
      // Update bounds with the current point
      bounds = {
        minX: Math.min(bounds.minX, point[0]),
        maxX: Math.max(bounds.maxX, point[0]),
        minY: Math.min(bounds.minY, point[1]),
        maxY: Math.max(bounds.maxY, point[1]),
      };

      // Add cap extensions if needed
      if (brushCap !== "butt") {
        const capExtra = brushCap === "square" ? brushHalfWidth : 0;

        // Handle start cap
        if (i === 0 && brushPoints.length > 1) {
          const [capX, capY] = calculateCapPoint(
            brushPoints[1],
            point,
            brushHalfWidth,
            capExtra,
          );
          bounds.minX = Math.min(bounds.minX, capX);
          bounds.maxX = Math.max(bounds.maxX, capX);
          bounds.minY = Math.min(bounds.minY, capY);
          bounds.maxY = Math.max(bounds.maxY, capY);
        }

        // Handle end cap
        if (i === brushPoints.length - 1 && i > 0) {
          const [capX, capY] = calculateCapPoint(
            point,
            brushPoints[i - 1],
            brushHalfWidth,
            capExtra,
          );
          bounds.minX = Math.min(bounds.minX, capX);
          bounds.maxX = Math.max(bounds.maxX, capX);
          bounds.minY = Math.min(bounds.minY, capY);
          bounds.maxY = Math.max(bounds.maxY, capY);
        }
      }

      return bounds;
    },
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    },
  );

  // Add padding for the combined widths of both strokes
  const intersectionBounds = createBounds(
    brushBounds.minX,
    brushBounds.minY,
    brushBounds.maxX - brushBounds.minX,
    brushBounds.maxY - brushBounds.minY,
    totalWidth,
  );

  return filterPointsWithBounds(
    eraserPoints,
    intersectionBounds,
    eraserCap,
    eraserWidth,
  );
}
