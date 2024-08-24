import _ from "lodash";
import { useArtifacts, useSectionInfos } from "state/definitions";

export function useArtifactData(sectionId) {
  const outputNames = useSectionInfos(
    (x) => x.x[sectionId].artifacts,
    _.isEqual,
  );
  return useArtifacts((x) => _.pick(x.x, outputNames));
}
