import { createRandomName } from "utils/idNameCreation";

export function newSectionVariant({
  name,
  values = {},
  children = [],
  selectedItem = null,
  code = "",
  codeInfoColId = null,
  description = "",
  keywordPositions = [],
  isFrozen = false,
  isDefault = true,
  sweep = [],
  runGroup = {},
}) {
  return {
    name: name ?? createRandomName(),
    values,
    children,
    selectedItem,
    code,
    codeInfoColId,
    description,
    keywordPositions,
    isFrozen,
    isDefault,
    sweep,
    runGroup,
  };
}
