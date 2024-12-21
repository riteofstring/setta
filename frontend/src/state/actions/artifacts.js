import { dataURLToBase64 } from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { dbLoadArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { newArtifact, newLayer } from "utils/objs/artifact";
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

export function createArtifactAndUpdateSection(
  sectionId,
  artifactId,
  artifactProps,
  sectionInfoState,
) {
  useArtifacts.setState({
    [artifactId]: newArtifact(artifactProps),
  });

  // const artifactGroupId = createNewId();
  // sectionInfoState.artifactGroups[artifactGroupId] = newLayer({
  //   artifactIds: [artifactId],
  // });

  // sectionInfoState.x[sectionId].artifactGroupIds.push(artifactGroupId);
}

export function getArtifactStateForSaving() {
  const result = {};

  for (const [key, value] of Object.entries(useArtifacts.getState())) {
    if (typeof value !== "function") {
      result[key] = value;
    }
  }

  for (const artifact of Object.values(result)) {
    if (artifact.type === "img" && artifact.value instanceof Image) {
      artifact.value = dataURLToBase64(artifact.value.src);
    }
  }

  return result;
}

export function addDrawAreaLayer(sectionId, state) {
  const artifactId = createNewId();
  useArtifacts.setState({
    [artifactId]: newArtifact({ type: "brushStrokes", value: [] }),
  });

  const artifactGroupId = createNewId();
  state.artifactGroups[artifactGroupId] = newLayer({
    artifactIds: [artifactId],
  });

  const artifactGroupIds = state.x[sectionId].artifactGroupIds;
  artifactGroupIds.push(artifactGroupId);

  state.x[sectionId].canvasSettings.activeLayerId = artifactGroupId;
}
