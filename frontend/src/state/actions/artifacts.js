import C from "constants/constants.json";
import { dbLoadArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { addSectionInEmptySpace } from "./sections/createSections";

export function updateArtifacts({ artifacts, addSection = false }) {
  useArtifacts.setState((x) => {
    for (const [fullPath, data] of Object.entries(artifacts)) {
      x.x[fullPath] = data;
    }
  });

  if (addSection) {
    for (const fullPath of Object.keys(artifacts)) {
      maybeAddArtifactSection(fullPath);
    }
  }
}

function maybeAddArtifactSection(artifactPath) {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (s.artifacts.includes(artifactPath)) {
      return;
    }
  }

  addSectionInEmptySpace({
    type: C.ARTIFACT,
    inputSectionProps: { artifacts: [artifactPath] },
  });
}

export async function loadArtifacts(sectionId, artifactPaths) {
  const res = await dbLoadArtifacts(sectionId, artifactPaths);
  if (res.status == 200) {
    updateArtifacts({ artifacts: res.data });
  }
}
