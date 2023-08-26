import { CodeInfoType } from "../types/codeInfo";
import { maybeNewId } from "../utils";

export function newCodeInfo({
  id,
  name = "",
  editable = false,
  children = [],
}: Partial<CodeInfoType>): CodeInfoType {
  return {
    id: maybeNewId(id),
    name,
    editable,
    children,
  };
}
