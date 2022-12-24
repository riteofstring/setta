import { CodeInfoType, RCType } from "../types/codeInfo";
import { maybeNewId } from "../utils";

export function newCodeInfo({
  id,
  name = "",
  version = null,
  defaultVal = null,
  type = "",
  description = "",
  rcType,
  parentId = null,
  path = "",
  children = [],
}: Partial<CodeInfoType> & { rcType: RCType }): CodeInfoType {
  return {
    id: maybeNewId(id),
    name,
    version,
    defaultVal,
    type,
    rcType,
    description,
    parentId,
    path,
    children,
  };
}
