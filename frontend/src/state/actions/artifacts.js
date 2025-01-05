import {
  base64StrToImgSrc,
  dataURLToBase64,
} from "components/Section/Layouts/DrawArea/base64Conversion";
import C from "constants/constants.json";
import _ from "lodash";
import { dbLoadArtifacts } from "requests/artifacts";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import {
  newArtifact,
  newArtifactTransform,
  newLayer,
} from "utils/objs/artifact";

export function updateArtifacts({ artifacts, addSection = false }) {
  useArtifacts.setState(artifacts);

  // if (addSection) {
  //   for (const [id, data] of Object.entries(artifacts)) {
  //     maybeAddArtifactSection(id, data.sectionType);
  //   }
  // }
}

// function maybeAddArtifactSection(artifactId, sectionType) {
//   for (const s of Object.values(useSectionInfos.getState().x)) {
//     if (s.artifactIds.includes(artifactId)) {
//       return;
//     }
//   }

//   addSectionInEmptySpace({
//     type: sectionType,
//     sectionProps: { artifactIds: [artifactId] },
//   });
// }

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
      const imgSrc = base64StrToImgSrc(data.value);
      data.value = new Image();
      data.value.src = imgSrc;
      await data.value.decode();
    }
  }
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
  const artifactType = "brushStrokes";
  useArtifacts.setState({
    [artifactId]: newArtifact({ type: artifactType, value: [] }),
  });

  const artifactGroupId = createNewId();
  state.artifactGroups[artifactGroupId] = newLayer({
    artifactTransforms: [
      newArtifactTransform(artifactId, C.DRAW, artifactType),
    ],
  });

  state.x[sectionId].artifactGroupIds.push(artifactGroupId);
  state.x[sectionId].canvasSettings.activeLayerId = artifactGroupId;
}

export function maybeAddArtifactGroupAndSetArtifactId(
  sectionId,
  sectionTypeName,
  artifactId,
  artifactType,
  state,
) {
  let artifactGroupId = state.x[sectionId].artifactGroupIds[0];
  if (!artifactGroupId) {
    artifactGroupId = createNewId();
    state.artifactGroups[artifactGroupId] = newLayer({
      artifactTransforms: [
        newArtifactTransform(artifactId, sectionTypeName, artifactType),
      ],
    });

    state.x[sectionId].artifactGroupIds.push(artifactGroupId);
  }

  state.artifactGroups[artifactGroupId].artifactTransforms[0].artifactId =
    artifactId;
}

export async function addImageArtifactAndMaybeCreateNewLayer(
  sectionId,
  activeLayerId,
  imgSrc,
  path = null,
) {
  const artifactId = createNewId();
  const artifactType = "img";
  const value = new Image();
  value.src = imgSrc;
  await value.decode();
  useArtifacts.setState({
    [artifactId]: newArtifact({
      value,
      path,
      type: artifactType,
    }),
  });
  useSectionInfos.setState((state) => {
    // let layerId = activeLayerId;
    // if (!layerId) {
    const layerId = createNewId();
    state.artifactGroups[layerId] = newLayer({});
    state.x[sectionId].artifactGroupIds.unshift(layerId);
    // }
    state.artifactGroups[layerId].artifactTransforms.push(
      newArtifactTransform(artifactId, C.DRAW, artifactType),
    );
  });
}
