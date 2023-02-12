import { closestCorners } from "@dnd-kit/core";

export function customCollisionDetectionSorting({
  active,
  droppableContainers,
  ...props
}) {
  // filter droppableContainers to consider only siblings
  return closestCorners({
    active,
    droppableContainers: droppableContainers.filter(
      (x) =>
        x.data.current.sortable?.containerId ===
        active.data.current.sortable.containerId
    ),
    ...props,
  });
}
