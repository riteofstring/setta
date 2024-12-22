import _ from "lodash";
import { loadArtifacts } from "state/actions/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useSectionArtifactGroups(sectionId, artifactAttrsToPick) {
  const { artifactIds, activeLayer, activeLayerId } =
    useSectionArtifactIdsAndActiveLayer(sectionId);
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

  return { activeLayer, activeLayerId, loadedArtifacts };
}

export function getSectionArtifactGroupMetadata(sectionId, state) {
  const { artifactGroupIds } = state.x[sectionId];
  return artifactGroupIds.map((a) => ({ id: a, ...state.artifactGroups[a] }));
}

function useSectionArtifactIdsAndActiveLayer(sectionId) {
  return useSectionInfos((state) => {
    const artifactIds = new Set();
    for (const artifactGroupId of state.x[sectionId].artifactGroupIds) {
      for (const t of state.artifactGroups[artifactGroupId]
        .artifactTransforms) {
        artifactIds.add(t.artifactId);
      }
    }

    const activeLayerId = state.x[sectionId].canvasSettings.activeLayerId;
    const activeLayer = state.artifactGroups[activeLayerId];

    return { artifactIds, activeLayer, activeLayerId };
  }, _.isEqual);
}
