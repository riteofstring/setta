import _ from "lodash";
import { useOutputs, useSectionInfos } from "state/definitions";

export function useOutputValues(sectionId) {
  const outputNames = useSectionInfos((x) => x.x[sectionId].outputs, _.isEqual);
  return useOutputs((x) => _.pick(x.x, outputNames));
}
