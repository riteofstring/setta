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
