import _ from "lodash";
import { CodeInfoType } from "./types/codeInfo";

export function findAllChildren(allCodeInfo, collectionIds) {
  return _.flatten(collectionIds.map((x) => allCodeInfo[x].children));
}

export function findAllDescendants(allCodeInfo, collectionIds) {
  const output: CodeInfoType[] = [];
  const idStack = [...collectionIds];
  const visited = new Set();
  while (idStack.length > 0) {
    const id = idStack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    const currInfo = allCodeInfo[id];
    output.push(currInfo);
    idStack.push(...currInfo.children);
  }
  return output.reverse();
}
