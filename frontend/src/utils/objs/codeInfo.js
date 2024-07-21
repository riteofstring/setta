import { maybeNewId } from "../idNameCreation";

export function newCodeInfo({
  id,
  name = "",
  editable = false,
  rcType,
  defaultVal = null,
  children = [],
  description = "",
  positionalOnly = false,
  isPinned = false,
  isFrozen = false,
  isSelected = false,
}) {
  return {
    id: maybeNewId(id),
    name,
    editable,
    rcType,
    defaultVal,
    children,
    description,
    positionalOnly,
    isPinned,
    isFrozen,
    isSelected,
  };
}
