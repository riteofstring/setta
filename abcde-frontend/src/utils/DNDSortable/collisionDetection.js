// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms

function sortCollisionsAsc(
  { data: { intersectionRatio: ra, absLeftDist: la, droppableContainer: dca } },
  { data: { intersectionRatio: rb, absLeftDist: lb, droppableContainer: dcb } }
) {
  // When comparing two nested sections, first check if they are left-aligned.
  // If they are not left-aligned, then prioritize the section that has the smallest left distance.
  // If they are left-aligned, then prioritize the section with most intersection.
  const cidA = dca.data.current?.sortable?.containerId;
  const cidB = dcb.data.current?.sortable?.containerId;
  if (cidA && cidB) {
    return la - lb || rb - ra;
  }
  // sortable A prioritized before non-sortable B
  if (cidA && !cidB) {
    return -1;
  }
  // sortable B prioritized before non-sortable A
  if (!cidA && cidB) {
    return 1;
  }
  // for two non-sortables, use intersection area
  return rb - ra;
}

function getIntersectionRatio(entry, target) {
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

    if (active.id !== id && rect) {
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
