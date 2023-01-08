// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms

function sortCollisionsAsc(
  { data: { intersectionRatio: ra, absLeftDist: la, droppableContainer: dca } },
  { data: { intersectionRatio: rb, absLeftDist: lb, droppableContainer: dcb } }
) {
  // When comparing two nested sections, first check if they are left-aligned.
  // If they are not left-aligned, then prioritize the section that has the smallest left distance.
  // If they are left-aligned, then prioritize the section with most intersection.
  if (
    dca.data.current?.sortable?.containerId &&
    dcb.data.current?.sortable?.containerId
  ) {
    return la - lb || rb - ra;
  }
  return rb - ra;
}

export function getIntersectionRatio(entry, target) {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  const width = right - left;
  const height = bottom - top;

  if (left < right && top < bottom) {
    const targetArea = target.width * target.height;
    const entryArea = entry.width * entry.height;
    const intersectionArea = width * height;
    const intersectionRatio =
      intersectionArea / (targetArea + entryArea - intersectionArea);

    return Number(intersectionRatio.toFixed(4));
  }

  // Rectangles do not overlap, or overlap has an area of zero (edge/corner overlap)
  return 0;
}

// function isIntersecting(entry, target) {
//   const top = Math.max(target.top, entry.top);
//   const left = Math.max(target.left, entry.left);
//   const right = Math.min(target.left + target.width, entry.left + entry.width);
//   const bottom = Math.min(target.top + target.height, entry.top + entry.height);
//   return left < right && top < bottom;
// }

// for each droppable area
// if rect intersection greater than 0
// find distance to top and bottom of droppable area
// and return minimum
export const customCollisionDetection = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  const collisions = [];
  const left = collisionRect.left;
  const centerY = collisionRect.top + collisionRect.height / 2;

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    if (
      active.id !== id &&
      rect
      // !droppableContainer.data.current.hasNested
    ) {
      const ratio = getIntersectionRatio(rect, collisionRect);
      if (ratio) {
        const currLeft = rect.left;
        const currCenterY = rect.top + rect.height / 2;
        const dist = left - currLeft;
        collisions.push({
          id,
          data: {
            droppableContainer,
            absLeftDist: Math.abs(dist),
            leftDist: dist,
            intersectionRatio: ratio,
            centerYDist: centerY - currCenterY,
          },
        });
      }
    }
  }

  return collisions.sort(sortCollisionsAsc);
};
