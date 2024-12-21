import DEFAULT_VALUES from "constants/defaultValues.json";
import _ from "lodash";
import { createRandomName } from "utils/idNameCreation";

export function newArtifact({ name, ...props }) {
  return _.merge(
    _.cloneDeep(DEFAULT_VALUES.artifact),
    { name: name ?? createRandomName() },
    props,
  );
}

export function newDrawAreaLocalLayer(artifactIdToType) {
  const output = {};
  for (const [artifactId, type] of Object.entries(artifactIdToType)) {
    output[artifactId] = newDrawAreaLocalLayerArtifactData(type);
  }
  return output;
}

export function newDrawAreaLocalLayerArtifactData(type) {
  if (type === "img") {
    return { type, value: new Image() };
  } else if (type === "brushStrokes") {
    return { type, value: [] };
  }
}

export function newLayerSettings(props) {
  return {
    artifactIds: [],
    visible: true,
    layerOpacity: 0.5,
    brushOpacity: 1,
    ...props,
  };
}
