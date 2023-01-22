import _ from "lodash";
import { useOutputs } from "models/info/outputs";

export function useOutputNames() {
  return useOutputs(
    (x) => _.mapValues(x.x, (group) => Object.keys(group)),
    _.isEqual
  );
}
