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

export const customCollisionDetectionSorting = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  if (!active.data.current.sortable) {
    return [];
  }
  let bestCollision = null;
  const corners = cornersOfRectangle(collisionRect);

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    // if droppableContainer is a sibling of active
    if (
      rect &&
      active.data.current.sortable.containerId ===
        droppableContainer.data.current.sortable?.containerId
    ) {
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

  return bestCollision ? [bestCollision] : [];
};
