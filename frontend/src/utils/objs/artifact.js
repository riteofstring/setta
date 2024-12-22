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

export function newLayer({ name, ...props }) {
  return {
    name: name ?? createRandomName(),
    artifactTransforms: [],
    visible: true,
    layerOpacity: 0.5,
    brushOpacity: 1,
    ...props,
  };
}

export function newArtifactTransform(artifactId, type) {
  return {
    artifactId,
    transform: [1, 0, 0, 1, 0, 0],
    eraserStrokes: type === "img" ? [] : {},
  };
}
