import _ from "lodash";
import { loadArtifacts } from "state/actions/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";

export function useLoadedArtifacts(artifactIds, artifactAttrsToPick) {
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

  return loadedArtifacts;
}

export function useDrawAreaActiveLayerAndLoadedArtifacts(sectionId) {
  const {
    artifactIds,
    artifactIdsWithDuplicates,
    activeLayer,
    size,
    canvasSettings,
  } = useSectionInfos((state) => {
    const artifactIds = getAllSectionArtifactIds(sectionId, state);
    const artifactIdsWithDuplicates = getAllSectionArtifactIds(
      sectionId,
      state,
      false,
    );
    const canvasSettings = state.x[sectionId].canvasSettings;
    const activeLayer = state.artifactGroups[canvasSettings.activeLayerId];

    return {
      artifactIds,
      artifactIdsWithDuplicates,
      activeLayer,
      size: state.x[sectionId].size,
      canvasSettings,
    };
  }, _.isEqual);

  const loadedArtifacts = useLoadedArtifacts(artifactIds, ["type"]);

  return {
    activeLayer,
    artifactIdsWithDuplicates,
    size,
    canvasSettings,
    loadedArtifacts,
  };
}

export function useAllSectionArtifacts(sectionId, artifactAttrsToPick) {
  const artifactIds = useSectionInfos(
    (state) => getAllSectionArtifactIds(sectionId, state),
    _.isEqual,
  );

  return useLoadedArtifacts(artifactIds, artifactAttrsToPick);
}

export function getSectionArtifactGroupMetadata(sectionId, state) {
  const { artifactGroupIds } = state.x[sectionId];
  return artifactGroupIds.map((a) => ({ id: a, ...state.artifactGroups[a] }));
}

export function getAllSectionArtifactIds(sectionId, state, unique = true) {
  const artifactIds = unique ? new Set() : [];
  for (const artifactGroupId of state.x[sectionId].artifactGroupIds) {
    for (const t of state.artifactGroups[artifactGroupId].artifactTransforms) {
      if (unique) {
        artifactIds.add(t.artifactId);
      } else {
        artifactIds.push(t.artifactId);
      }
    }
  }
  return artifactIds;
}
