import { isUserPreset } from "abcde-utils/src/uiTypeConstants";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";

export function useUserPresetUITypes() {
  return useUITypes(
    (x) => Object.values(x.x).filter((u) => isUserPreset(u)),
    _.isEqual
  );
}
