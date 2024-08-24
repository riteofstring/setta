import C from "constants/constants.json";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { addSectionInEmptySpace } from "../sections/createSections";

export function updateArtifacts(artifacts) {
  useArtifacts.setState((x) => {
    for (const [name, data] of Object.entries(artifacts.data)) {
      x.x[name] = data;
    }
  });

  for (const name of Object.keys(artifacts.data)) {
    maybeAddArtifactSection(name);
  }
}

function maybeAddArtifactSection(artifactName) {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (s.artifacts.includes(artifactName)) {
      return;
    }
  }

  addSectionInEmptySpace({
    type: C.ARTIFACT,
    inputSectionProps: { artifacts: [artifactName] },
  });
}
