import {
  base64ToImageObj,
  dataURLToBase64,
} from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { useArtifacts, useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_load_artifacts,
  route_read_csv_base64,
} from "utils/generatedEndpoints";
import { ArtifactTypeEnum } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { newArtifactTransform, newLayer } from "utils/objs/artifact";
import { getSectionType } from "./sectionInfos";

export async function loadArtifacts(sectionId, artifactIds, signal) {
  const res = await route_load_artifacts(artifactIds);
  if (res200(res)) {
    const artifactsFromBackend = _.cloneDeep(res.data);
    await prepareArtifactsForRendering(artifactsFromBackend);
    if (signal?.aborted) return;
    useArtifacts.setState((state) => ({
      x: { ...state.x, ...artifactsFromBackend },
    }));
    useProjectState.setState((state) => {
      actionAfterSettingSectionArtifacts(artifactIds, sectionId, state);
    });
  }
}

async function prepareArtifactsForRendering(artifactsFromBackend) {
  for (const data of Object.values(artifactsFromBackend)) {
    data.value = await prepareArtifactForRendering(data.type, data.value);
  }
}

export async function prepareArtifactForRendering(
  type: ArtifactTypeEnum,
  value,
) {
  switch (type) {
    case ArtifactTypeEnum.IMG:
      return await base64ToImageObj(value);
    case ArtifactTypeEnum.LIST:
    case ArtifactTypeEnum.BRUSH_STROKES:
    case ArtifactTypeEnum.CHAT_HISTORY:
      return value;
  }
}

export async function prepareDataURLForRendering(
  type: ArtifactTypeEnum,
  value,
) {
  switch (type) {
    case ArtifactTypeEnum.IMG:
      return await base64ToImageObj(value);
    case ArtifactTypeEnum.LIST:
      const res = await route_read_csv_base64(dataURLToBase64(value));
      if (res200(res)) {
        return res.data;
      }
    default:
      return null;
  }
}

export function getArtifactStateForSaving() {
  const result = {};

  for (const [id, artifact] of Object.entries(useArtifacts.getState().x)) {
    if (typeof artifact === "function") {
      continue;
    } else if (
      artifact.type === ArtifactTypeEnum.IMG &&
      artifact.value instanceof Image
    ) {
      result[id] = { ...artifact, value: dataURLToBase64(artifact.value.src) };
    } else {
      result[id] = artifact;
    }
  }

  return result;
}

function addArtifactUponSectionCreation({
  sectionId,
  sectionTypeName,
  artifactType,
  state,
}) {
  const artifactId = createNewId();
  useArtifacts.setState((state) => ({
    x: {
      ...state.x,
      [artifactId]: createArtifact({ type: artifactType, value: "" }),
    },
  }));

  const artifactGroupId = createNewId();
  state.artifactGroups[artifactGroupId] = newLayer({
    artifactTransforms: [
      newArtifactTransform(artifactId, sectionTypeName, artifactType),
    ],
  });

  state.sections[sectionId].artifactGroupIds.push(artifactGroupId);

  return artifactGroupId;
}

export function addDrawAreaLayer(sectionId, state) {
  const artifactGroupId = addArtifactUponSectionCreation({
    sectionId,
    artifactType: ArtifactTypeEnum.BRUSH_STROKES,
    sectionTypeName: UITypeNameEnum.DRAW,
    state,
  });

  state.sections[sectionId].canvasSettings.activeLayerId = artifactGroupId;
}

export function addChatHistoryArtifact(sectionId, state) {
  addArtifactUponSectionCreation({
    sectionId,
    artifactType: ArtifactTypeEnum.CHAT_HISTORY,
    sectionTypeName: UITypeNameEnum.CHAT,
    state,
  });
}

export function updateArtifactGroupAndSetArtifactId({
  sectionId,
  sectionTypeName,
  artifactId,
  artifactType,
  createNewArtifactGroup = false,
  add,
  state,
}) {
  let artifactGroupId = getActiveArtifactGroupId(
    sectionId,
    sectionTypeName,
    state,
  );
  let currArtifactGroup;

  if (add) {
    if (!artifactGroupId || createNewArtifactGroup) {
      artifactGroupId = createNewId();
      state.artifactGroups[artifactGroupId] = newLayer({});
      state.sections[sectionId].artifactGroupIds.unshift(artifactGroupId);
    }

    const artifactTransform = newArtifactTransform(
      artifactId,
      sectionTypeName,
      artifactType,
    );

    currArtifactGroup = state.artifactGroups[artifactGroupId];
    if (
      sectionTypeName === UITypeNameEnum.DRAW ||
      sectionTypeName === UITypeNameEnum.CHART
    ) {
      currArtifactGroup.artifactTransforms.push(artifactTransform);
    } else {
      currArtifactGroup.artifactTransforms = [artifactTransform];
    }
  } else {
    // remove artifactId
    currArtifactGroup = state.artifactGroups[artifactGroupId];
    if (currArtifactGroup) {
      currArtifactGroup.artifactTransforms =
        currArtifactGroup.artifactTransforms.filter(
          (t) => t.artifactId !== artifactId,
        );
    }
  }

  if (currArtifactGroup) {
    actionAfterSettingSectionArtifacts(
      currArtifactGroup.artifactTransforms.map((x) => x.artifactId),
      sectionId,
      state,
    );
  }
}

export async function addArtifactAndMaybeCreateNewArtifactGroup({
  sectionId,
  createNewArtifactGroup,
  value,
  artifactType,
  path = "",
}) {
  const artifactId = createNewId();
  useArtifacts.setState((state) => ({
    x: {
      ...state.x,
      [artifactId]: createArtifact({
        value,
        path,
        type: artifactType,
      }),
    },
  }));
  useProjectState.setState((state) => {
    const sectionTypeName = getSectionType(sectionId, state);
    updateArtifactGroupAndSetArtifactId({
      sectionId,
      sectionTypeName,
      artifactId,
      artifactType,
      createNewArtifactGroup,
      add: true,
      state,
    });
  });
}

function getActiveArtifactGroupId(sectionId, sectionTypeName, state) {
  switch (sectionTypeName) {
    case UITypeNameEnum.DRAW:
      return state.sections[sectionId].canvasSettings.activeLayerId;
    case UITypeNameEnum.IMAGE:
    case UITypeNameEnum.CHART:
      return state.sections[sectionId].artifactGroupIds[0];
  }
}

function actionAfterSettingSectionArtifacts(artifactIds, sectionId, state) {
  const sectionTypeName = getSectionType(sectionId, state);
}

export function getNamePathTypeKey(artifact) {
  return JSON.stringify([artifact.name, artifact.path, artifact.type]);
}
