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

export function newDrawAreaLocalLayerState(type) {
  if (type === "img") {
    return { image: new Image() };
  } else if (type === "brushStrokes") {
    return { strokes: [] };
  }
}

export function newLayerSettings() {
  return { opacity: 0.5, brushOpacity: 1 };
}
