import _ from "lodash";
import { loadArtifacts } from "state/actions/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useSectionArtifactGroups(sectionId, artifactAttrsToPick) {
  const { artifactIds, artifactGroups } = useSectionArtifactIds(sectionId);
  const loadedArtifacts = useArtifacts((x) => {
    const output = {};
    for (const id of artifactIds) {
      if (x[id]?.value) {
        output[id] = _.pick(x[id], artifactAttrsToPick);
      }
    }
    return output;
  }, _.isEqual);

  useDeepCompareEffect(() => {
    const notLoaded = [];
    for (const id of artifactIds) {
      if (!(id in loadedArtifacts)) {
        notLoaded.push(id);
      }
    }
    loadArtifacts(notLoaded);
  }, [artifactIds]);

  return { artifactGroups, loadedArtifacts };
}

export function getSectionArtifactGroupMetadata(sectionId, state) {
  const { artifactGroupIds } = state.x[sectionId];
  return artifactGroupIds.map((a) => ({ id: a, ...state.artifactGroups[a] }));
}

function useSectionArtifactIds(sectionId) {
  return useSectionInfos((state) => {
    const artifactGroups = getSectionArtifactGroupMetadata(sectionId, state);
    const artifactIds = new Set();
    for (const group of artifactGroups) {
      for (const artifactId of group.artifactIds) {
        artifactIds.add(artifactId);
      }
    }
    return { artifactIds, artifactGroups };
  }, _.isEqual);
}
