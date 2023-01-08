// Some functions borrowed from https://github.com/clauderic/dnd-kit/blob/master/packages/core/src/utilities/algorithms

function sortCollisionsAsc({ data: { value: a } }, { data: { value: b } }) {
  return a - b;
}

function isIntersecting(entry, target) {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  return left < right && top < bottom;
}

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

  for (const droppableContainer of droppableContainers) {
    const { id } = droppableContainer;
    const rect = droppableRects.get(id);

    if (active.id !== id && rect && isIntersecting(rect, collisionRect)) {
      const currLeft = rect.left;
      const dist = left - currLeft;
      collisions.push({
        id,
        data: { droppableContainer, value: Math.abs(dist), rawValue: dist },
      });
    }
  }

  return collisions.sort(sortCollisionsAsc);
};
