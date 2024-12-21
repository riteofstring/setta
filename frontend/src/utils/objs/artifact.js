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
    artifactIds: [],
    visible: true,
    layerOpacity: 0.5,
    brushOpacity: 1,
    ...props,
  };
}
