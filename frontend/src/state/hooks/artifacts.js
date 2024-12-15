import _ from "lodash";
import { useState } from "react";
import { loadArtifacts } from "state/actions/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useArtifactData(sectionId) {
  const [isLoaded, setIsLoaded] = useState(false);
  const artifactIds = useSectionInfos(
    (x) => x.x[sectionId].artifactIds,
    _.isEqual,
  );
  const artifacts = useArtifacts((x) => _.pick(x.x, artifactIds));

  useDeepCompareEffect(() => {
    if (artifactIds.length !== _.size(artifacts)) {
      setIsLoaded(false);
      loadArtifacts(artifactIds);
    } else {
      setIsLoaded(true);
    }
  }, [artifactIds, artifacts]);

  return { artifacts, isLoaded };
}
