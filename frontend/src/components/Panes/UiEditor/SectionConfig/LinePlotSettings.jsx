import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function LinePlotSettings({ sectionId }) {
  function onClick(artifactId) {
    useSectionInfos.setState((state) => {
      const artifactGroupId = state.x[sectionId].artifactGroupIds[0];
      state.artifactGroups[artifactGroupId].artifactTransforms[0].artifactId =
        artifactId;
    });
  }

  return (
    <JustListOfArtifacts
      sectionId={sectionId}
      sectionTypeName={C.LINE_PLOT}
      onClick={onClick}
    />
  );
}
