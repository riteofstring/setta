import { ViewMode } from "utils/generatedTypes";

export function sortViewModes(viewModes: Array<ViewMode>) {
  return [...viewModes].sort((a, b) => {
    const aSortIndex = a.sortIndex ?? 0;
    const bSortIndex = b.sortIndex ?? 0;
    const aName = a.name.trim();
    const bName = b.name.trim();
    if (aSortIndex !== bSortIndex) {
      return aSortIndex - bSortIndex;
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
