import { dbLoadArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { addSectionInEmptySpace } from "./sections/createSections";

export function updateArtifacts({ artifacts, addSection = false }) {
  console.log("updateArtifacts", artifacts);
  useArtifacts.setState((x) => {
    for (const [fullPath, data] of Object.entries(artifacts)) {
      x.x[fullPath] = data;
    }
  });

  if (addSection) {
    for (const [fullPath, data] of Object.entries(artifacts)) {
      maybeAddArtifactSection(fullPath, data.sectionType);
    }
  }
}

function maybeAddArtifactSection(artifactPath, sectionType) {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (s.artifacts.includes(artifactPath)) {
      return;
    }
  }

  addSectionInEmptySpace({
    type: sectionType,
    sectionProps: { artifacts: [artifactPath] },
  });
}

export async function loadArtifacts(sectionId, artifactPaths) {
  const res = await dbLoadArtifacts(sectionId, artifactPaths);
  if (res.status === 200) {
    updateArtifacts({ artifacts: res.data });
  }
}
