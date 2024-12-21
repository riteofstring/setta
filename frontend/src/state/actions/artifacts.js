import _ from "lodash";
import { dbLoadArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { newArtifact } from "utils/objs/artifact";
import { addSectionInEmptySpace } from "./sections/createSections";

export function updateArtifacts({ artifacts, addSection = false }) {
  useArtifacts.setState(artifacts);

  if (addSection) {
    for (const [id, data] of Object.entries(artifacts)) {
      maybeAddArtifactSection(id, data.sectionType);
    }
  }
}

function maybeAddArtifactSection(artifactId, sectionType) {
  for (const s of Object.values(useSectionInfos.getState().x)) {
    if (s.artifactIds.includes(artifactId)) {
      return;
    }
  }

  addSectionInEmptySpace({
    type: sectionType,
    sectionProps: { artifactIds: [artifactId] },
  });
}

export async function loadArtifacts(artifactIds) {
  const res = await dbLoadArtifacts(artifactIds);
  if (res.status === 200) {
    const artifactsFromBackend = _.cloneDeep(res.data);
    await prepareArtifactsForRendering(artifactsFromBackend);
    updateArtifacts({ artifacts: artifactsFromBackend });
  }
}

async function prepareArtifactsForRendering(artifactsFromBackend) {
  for (const data of Object.values(artifactsFromBackend)) {
    if (data.type === "img") {
      const base64Str = `data:image/png;base64,${data.value}`;
      data.value = new Image();
      data.value.src = base64Str;
      await data.value.decode();
    }
  }
}

export function maybeCreateArtifactAndUpdateSection(
  sectionId,
  artifactId,
  artifactProps,
  sectionInfoState,
) {
  useArtifacts.setState((x) => {
    if (!(artifactId in x.x)) {
      x.x[artifactId] = newArtifact(artifactProps);
    } else {
      x.x[artifactId].value = artifactProps.value;
    }
  });

  const artifactIds = sectionInfoState.x[sectionId].artifactIds;
  if (!artifactIds.includes(artifactId)) {
    artifactIds.push(artifactId);
  }
}
