import { useProjectState } from "state/definitions";

export function useHasViewModeTabs() {
  return useProjectState((x) => {
    const viewModes = x.projectConfig.viewModes;
    for (const modeId in viewModes) {
      if (viewModes[modeId]?.isTab) {
        return true;
      }
    }
    return false;
  });
}
