// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms/closestCorners.ts

function compareCollisions(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  return a.data.effectiveDistance < b.data.effectiveDistance ? a : b;
}

function distanceBetween(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function cornersOfRectangle({ left, top, height, width }) {
  return [
    {
      x: left,
      y: top,
    },
    {
      x: left + width,
      y: top,
    },
    {
      x: left,
      y: top + height,
    },
    {
      x: left + width,
      y: top + height,
    },
  ];
}

function getIntersectionRatio(entry, target) {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  const width = right - left;
  const height = bottom - top;

  if (left < right && top < bottom) {
    // const targetArea = target.width * target.height;
    // const entryArea = entry.width * entry.height;
    const intersectionArea = width * height;
    // const intersectionRatio =
    // intersectionArea / (targetArea + entryArea - intersectionArea);

    return Number(intersectionArea.toFixed(4));
  }

  // Rectangles do not overlap, or overlap has an area of zero (edge/corner overlap)
  return 0;
}

export const customCollisionDetectionSorting = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  // if (!active.data.current.sortable) {
  //   return [];
  // }
  let bestCollision = null;
  const corners = cornersOfRectangle(collisionRect);

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    // if droppableContainer is a sibling of active
    if (rect && id !== active.id) {
      const ratio = getIntersectionRatio(rect, collisionRect);
      if (ratio) {
        const rectCorners = cornersOfRectangle(rect);
        const distances = corners.reduce((accumulator, corner, index) => {
          return accumulator + distanceBetween(rectCorners[index], corner);
        }, 0);
        const effectiveDistance = Number((distances / 4).toFixed(4));
        bestCollision = compareCollisions(bestCollision, {
          id,
          data: {
            droppableContainer,
            effectiveDistance,
          },
        });
      }
    }
  }

  return bestCollision ? [bestCollision] : [];
};
