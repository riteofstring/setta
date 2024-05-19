import { CodeInfoType } from "../types/codeInfo";
import { maybeNewId } from "../utils";

export function newCodeInfo({
  id,
  name = "",
  editable = false,
  rcType,
  defaultVal = null,
  children = [],
  description = "",
  isPinned = false,
  isFrozen = false,
  isSelected = false,
}: Partial<CodeInfoType>): CodeInfoType {
  return {
    id: maybeNewId(id),
    name,
    editable,
    rcType,
    defaultVal,
    children,
    description,
    isPinned,
    isFrozen,
    isSelected,
  };
}
