import C from "constants/constants.json";
import { maybeAddArtifactGroupAndSetArtifactId } from "state/actions/artifacts";
import { useSectionInfos } from "state/definitions";
import { JustListOfArtifacts } from "./ListOfArtifacts";

export function LinePlotSettings({ sectionId }) {
  function onClick(artifactId, artifactType) {
    useSectionInfos.setState((state) => {
      maybeAddArtifactGroupAndSetArtifactId(
        sectionId,
        C.LINE_PLOT,
        artifactId,
        artifactType,
        state,
      );
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
