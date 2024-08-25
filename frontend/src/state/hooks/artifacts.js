import _ from "lodash";
import { useState } from "react";
import { loadArtifacts } from "state/actions/artifacts/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useArtifactData(sectionId) {
  const [isLoaded, setIsLoaded] = useState(false);
  const artifactPaths = useSectionInfos(
    (x) => x.x[sectionId].artifacts,
    _.isEqual,
  );
  const artifacts = useArtifacts((x) => _.pick(x.x, artifactPaths));

  useDeepCompareEffect(() => {
    if (artifactPaths.length !== _.size(artifacts)) {
      setIsLoaded(false);
      loadArtifacts(sectionId, artifactPaths);
    } else {
      setIsLoaded(true);
    }
  }, [artifactPaths]);

  return { artifacts, isLoaded };
}
