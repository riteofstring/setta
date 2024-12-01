import DEFAULT_VALUES from "constants/defaultValues.json";
import { createRandomName } from "utils/idNameCreation";
import _ from "lodash"

export function newSectionVariant({ name, ...props }) {
  return {
    ..._.cloneDeep(DEFAULT_VALUES.sectionVariant),
    name: name ?? createRandomName(),
    ...props,
  };
}
