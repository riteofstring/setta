import C from "constants/constants.json";
import _ from "lodash";
import { useState } from "react";
import { useSectionInfos } from "state/definitions";
import { getAllSectionArtifactIds } from "state/hooks/artifacts";
import { ListOfArtifacts } from "./ListOfArtifacts";

export function ImageAreaSettings({ sectionId }) {
  const [availableArtifacts, setAvailableArtifacts] = useState({});
  const selectedArtifactIds = useSectionInfos(
    (state) => getAllSectionArtifactIds(sectionId, state),
    _.isEqual,
  );

  function onClick(artifactId) {
    useSectionInfos.setState((state) => {
      const artifactGroupId = state.x[sectionId].artifactGroupIds[0];
      state.artifactGroups[artifactGroupId].artifactTransforms[0].artifactId =
        artifactId;
    });
  }

  function getItemStyle(id) {
    return selectedArtifactIds.has(id)
      ? "border-gray-200 bg-blue-800 hover:bg-blue-50 dark:hover:bg-blue-500"
      : null;
  }

  return (
    <ListOfArtifacts
      sectionTypeName={C.IMAGE}
      availableArtifacts={availableArtifacts}
      setAvailableArtifacts={setAvailableArtifacts}
      getItemStyle={getItemStyle}
      onClick={onClick}
    />
  );
}
