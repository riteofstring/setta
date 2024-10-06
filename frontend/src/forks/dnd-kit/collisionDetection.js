// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms

function compareCollisions(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  // When comparing two nested sections, first check if they are left-aligned.
  // If they are not left-aligned, then prioritize the section that has the smallest left distance.
  // If they are left-aligned, then prioritize the section with most intersection.
  const cidA = a.data.droppableContainer.data.current.sortable?.containerId;
  const cidB = b.data.droppableContainer.data.current.sortable?.containerId;
  // sortable A prioritized before non-sortable B
  if (cidA && !cidB) {
    return a;
  }
  // sortable B prioritized before non-sortable A
  if (!cidA && cidB) {
    return b;
  }

  const ra = a.data.intersectionRatio;
  const rb = b.data.intersectionRatio;

  if (cidA && cidB) {
    const la = a.data.absLeftDist;
    const lb = b.data.absLeftDist;
    const rawLa = a.data.leftDist;
    const rawLb = b.data.leftDist;
    // if left-aligned, return rect with larger intersection
    if (la - lb === 0) {
      return rb - ra > 0 ? b : a;
    }
    // if the active rect is to the right of both rects, then return the one that has the closest left edge
    if (rawLa > 0 && rawLb > 0) {
      return la - lb > 0 ? b : a;
    }
    // if b's left edge is closer than a's left edge
    // and the active rect is to the left of b, then return b
    if (la - lb > 0) {
      return rawLb < 0 ? b : a;
    }
    // if a's left edge is closer than b's left edge
    // and the active rect is to the left of a, then return a
    if (lb - la > 0) {
      return rawLa < 0 ? a : b;
    }
  }
  // for two non-sortables, use intersection area
  return rb - ra > 0 ? b : a;
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

export const customCollisionDetection = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  let bestCollision = null;
  const left = collisionRect.left;

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    // rect must exist.
    // If active doesn't have a parent, then don't look for overlap with self.
    if (
      rect &&
      (active.data.current.sortable?.containerId || active.id !== id)
    ) {
      const ratio = getIntersectionRatio(rect, collisionRect);
      if (ratio) {
        const dist = left - rect.left;
        bestCollision = compareCollisions(bestCollision, {
          id,
          data: {
            droppableContainer,
            absLeftDist: Math.abs(dist),
            leftDist: dist,
            intersectionRatio: ratio,
          },
        });
      }
    }
  }

  return bestCollision ? [bestCollision] : [];
};
