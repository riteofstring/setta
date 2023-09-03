import { CodeInfoType, RCType } from "../types/codeInfo";
import { maybeNewId } from "../utils";

export function newCodeInfo({
  id,
  name = "",
  editable = false,
  rcType,
  defaultVal = null,
  children = [],
}: Partial<CodeInfoType> & { rcType: RCType }): CodeInfoType {
  return {
    id: maybeNewId(id),
    name,
    editable,
    rcType,
    defaultVal,
    children,
  };
}
