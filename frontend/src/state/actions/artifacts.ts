import {
  base64ToImageObj,
  dataURLToBase64,
} from "components/Section/Layouts/DrawArea/base64Conversion";
import _ from "lodash";
import { dbLoadArtifacts, dbReadCSVBase64 } from "requests/artifacts";
import { useArtifacts, useMisc, useProjectState } from "state/definitions";
import {
  ArtifactType,
  ArtifactTypeSchema,
  UITypeNameSchema,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { newArtifactTransform, newLayer } from "utils/objs/artifact";
import { getSectionType } from "./sectionInfos";
import { maybeIncrementProjectStateVersion } from "./undo";

export async function loadArtifacts(sectionId, artifactIds, signal) {
  const res = await dbLoadArtifacts(artifactIds);
  if (res.status === 200) {
    const artifactsFromBackend = _.cloneDeep(res.data);
    await prepareArtifactsForRendering(artifactsFromBackend);
    if (signal?.aborted) return;
    useArtifacts.setState((state) => ({
      x: { ...state.x, ...artifactsFromBackend },
    }));
    useProjectState.setState((state) => {
      actionAfterSettingSectionArtifacts(artifactIds, sectionId, state);
    });
    maybeIncrementProjectStateVersion(true);
  }
}

async function prepareArtifactsForRendering(artifactsFromBackend) {
  for (const data of Object.values(artifactsFromBackend)) {
    data.value = await prepareArtifactForRendering(data.type, data.value);
  }
}

export async function prepareArtifactForRendering(type: ArtifactType, value) {
  switch (type) {
    case ArtifactTypeSchema.enum.IMG:
      return await base64ToImageObj(value);
    case ArtifactTypeSchema.enum.LIST:
    case ArtifactTypeSchema.enum.BRUSH_STROKES:
    case ArtifactTypeSchema.enum.CHAT_HISTORY:
      return value;
  }
}

export async function prepareDataURLForRendering(type: ArtifactType, value) {
  switch (type) {
    case ArtifactTypeSchema.enum.IMG:
      return await base64ToImageObj(value);
    case ArtifactTypeSchema.enum.LIST:
      const res = await dbReadCSVBase64(dataURLToBase64(value));
      if (res.status == 200) {
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
      artifact.type === ArtifactTypeSchema.enum.IMG &&
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
    artifactType: ArtifactTypeSchema.enum.BRUSH_STROKES,
    sectionTypeName: UITypeNameSchema.enum.DRAW,
    state,
  });

  state.sections[sectionId].canvasSettings.activeLayerId = artifactGroupId;
}

export function addChatHistoryArtifact(sectionId, state) {
  addArtifactUponSectionCreation({
    sectionId,
    artifactType: ArtifactTypeSchema.enum.CHAT_HISTORY,
    sectionTypeName: UITypeNameSchema.enum.CHAT,
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
      sectionTypeName === UITypeNameSchema.enum.DRAW ||
      sectionTypeName === UITypeNameSchema.enum.CHART
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
    case UITypeNameSchema.enum.DRAW:
      return state.sections[sectionId].canvasSettings.activeLayerId;
    case UITypeNameSchema.enum.IMAGE:
    case UITypeNameSchema.enum.CHART:
      return state.sections[sectionId].artifactGroupIds[0];
  }
}

function actionAfterSettingSectionArtifacts(artifactIds, sectionId, state) {
  const sectionTypeName = getSectionType(sectionId, state);
  if (sectionTypeName === UITypeNameSchema.enum.CHART) {
    updateColumnNameSelections(artifactIds, sectionId, state);
  }
}

export function updateColumnNameSelections(artifactIds, sectionId, state) {
  const { chartSettings } = state.sections[sectionId];
  const artifactValue = processChartArtifacts(
    artifactIds.map((a) => useArtifacts.getState().x[a]),
    chartSettings.type,
  );
  const seriesNames = Object.keys(artifactValue);
  useMisc.setState((state) => ({
    chartDisplayedSeriesNames: {
      ...state.chartDisplayedSeriesNames,
      [sectionId]: seriesNames,
    },
  }));
  if (seriesNames === 0) {
    return;
  }
  // TODO: think about whether we need this
  // if (!seriesNames.includes(chartSettings.xAxisColumn)) {
  //   chartSettings.xAxisColumn = seriesNames[0];
  // }
}

// doesn't need whole artifacts, just name and value
export function processChartArtifacts(artifacts, chartType) {
  switch (chartType) {
    case "line":
      return processLineChartArtifacts(artifacts);
    case "scatter":
      return processScatterChartArtifacts(artifacts);
    default:
      return {};
  }
}

function processLineChartArtifacts(artifacts) {
  const output = {};
  for (const artifact of artifacts) {
    for (const [seriesName, values] of Object.entries(artifact.value)) {
      const newSeriesName =
        artifacts.length === 1 ? seriesName : `${artifact.name}/${seriesName}`;
      output[newSeriesName] = [...values];
    }
  }
  return output;
}

function processScatterChartArtifacts(artifacts) {
  const output = {};
  for (const artifact of artifacts) {
    for (const [seriesName, values] of Object.entries(artifact.value)) {
      if (!(seriesName in output)) {
        output[seriesName] = [];
      }
      output[seriesName].push(...values);
    }
  }
  return output;
}

export function getNamePathTypeKey(artifact) {
  return JSON.stringify([artifact.name, artifact.path, artifact.type]);
}
