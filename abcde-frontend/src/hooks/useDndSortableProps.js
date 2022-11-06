import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "react-flow-renderer";

export function useDndSortableProps(sectionId) {
  const zoom = useStore((x) => x.transform[2]);

  function transformWithZoom(transform) {
    if (transform) {
      return {
        ...transform,
        x: transform.x / zoom,
        y: transform.y / zoom,
      };
    }
    return transform;
  }

  const sortableProps = useSortable({
    id: sectionId,
    data: { zoom },
  });

  // Possible TODO:
  // Use isOver (available in sortableProps) to do some styling when
  // another element is hovering over this element.
  const { attributes, listeners, setNodeRef, transform, transition } =
    sortableProps;

  const scaledTransform = transformWithZoom(transform);

  const style = {
    transform: CSS.Translate.toString(scaledTransform),
    transition,
  };

  return {
    style,
    ref: setNodeRef,
    attributes,
    dragListeners: listeners,
  };
}
