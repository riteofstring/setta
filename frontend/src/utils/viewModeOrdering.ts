import { arrayMove } from "@dnd-kit/helpers";
import { ViewModeConfig } from "utils/generatedTypes";

export function sortViewModes(viewModes: Array<ViewModeConfig>) {
  return [...viewModes].sort((a, b) => {
    const aName = a.name.trim();
    const bName = b.name.trim();
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }
    const byName = aName.localeCompare(bName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });
}

export function reorderViewModeIdList(
  orderedIds: Array<string>,
  activeId: string,
  overId: string,
): Array<string> {
  const activeIndex = orderedIds.indexOf(activeId);
  const overIndex = orderedIds.indexOf(overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return orderedIds;
  }
  return arrayMove(orderedIds, activeIndex, overIndex);
}
