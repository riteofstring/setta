import DEFAULT_VALUES from "constants/defaultValues.json";
import { createRandomName } from "utils/idNameCreation";

export function newSectionVariant({ name, ...props }) {
  return {
    ...DEFAULT_VALUES.sectionVariant,
    name: name ?? createRandomName(),
    ...props,
  };
}
