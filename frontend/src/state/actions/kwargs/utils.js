import { useActiveSection, useCodeInfo } from "state/definitions";
import { findAllParameters } from "utils/getDescendants";
import {
  batchUpdateCodeInfoChildren,
  getSectionCodeInfoChildren,
} from "../codeInfoCols";

export function getAllSelectedParams(sectionId) {
  const codeInfoState = useCodeInfo.getState().x;
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  const { ids } = findAllParameters(
    codeInfoState,
    codeInfoChildren,
    codeInfoChildren[null],
    // (p) => p.rcType === C.PARAMETER,
  );
  const output = [];
  for (const id of ids) {
    if (codeInfoState[id].isSelected) {
      output.push(id);
    }
  }
  return output;
}

function computeNewChildrenForRightPush(paramId, newChildren, sectionId) {
  const codeInfoChildren = getSectionCodeInfoChildren(sectionId);
  let parentId = null,
    siblings = [],
    paramIdx = -1;
  console.log("codeInfoChildren", codeInfoChildren);
  for (const [k, children] of Object.entries(codeInfoChildren)) {
    paramIdx = children.indexOf(paramId);
    console.log("children", children);
    if (paramIdx !== -1) {
      parentId = k;
      siblings = children;
      break;
    }
  }

  console.log("parentId", parentId);
  console.log("siblings", siblings);
  console.log("paramIdx", paramIdx);

  // This shouldn't ever happen
  if (paramIdx === -1) {
    return;
  }

  const cState = useCodeInfo.getState().x;
  let prevUnselectedSiblingId = null;
  for (let i = paramIdx - 1; i >= 0; i--) {
    if (!cState[siblings[i]].isSelected) {
      prevUnselectedSiblingId = siblings[i];
      break;
    }
  }
  if (!prevUnselectedSiblingId) {
    return;
  }

  if (!(parentId in newChildren)) {
    newChildren[parentId] = siblings;
  }
  newChildren[parentId] = newChildren[parentId].filter((x) => x !== paramId);

  if (!(prevUnselectedSiblingId in newChildren)) {
    newChildren[prevUnselectedSiblingId] =
      codeInfoChildren[prevUnselectedSiblingId];
  }
  newChildren[prevUnselectedSiblingId] = [
    ...newChildren[prevUnselectedSiblingId],
    paramId,
  ];
}

export function computeNewChildrenForLeftPush(
  codeInfos,
  paramInfo,
  newChildren,
  numChildrenInserted,
) {
  const parentInfo = codeInfos.find((x) => x.children.includes(paramInfo.id));
  const gParentInfo = codeInfos.find((x) => x.children.includes(parentInfo.id));
  if (!gParentInfo || gParentInfo.isSelected || parentInfo.isSelected) {
    return;
  }

  const siblingList = parentInfo.children;
  const paramIdx = siblingList.indexOf(paramInfo.id);
  const paramNewChildren = [];
  for (let i = paramIdx + 1; i < siblingList.length; i++) {
    const siblingId = siblingList[i];
    if (useCodeInfo.getState().x[siblingId].isSelected) {
      break;
    }
    paramNewChildren.push(siblingId);
  }

  if (!(paramInfo.id in newChildren)) {
    newChildren[paramInfo.id] = paramInfo.children;
  }
  newChildren[paramInfo.id] = [
    ...newChildren[paramInfo.id],
    ...paramNewChildren,
  ];

  if (!(parentInfo.id in newChildren)) {
    newChildren[parentInfo.id] = parentInfo.children;
  }
  newChildren[parentInfo.id] = newChildren[parentInfo.id].filter(
    (x) => x !== paramInfo.id && !paramNewChildren.includes(x),
  );

  const parentSiblingList = gParentInfo.children;
  const parentIdx = parentSiblingList.indexOf(parentInfo.id);
  console.log("parentIdx", parentIdx);
  if (!(gParentInfo.id in numChildrenInserted)) {
    numChildrenInserted[gParentInfo.id] = 0;
  }

  const insertIdx = parentIdx + 1 + numChildrenInserted[gParentInfo.id];
  console.log("insertIdx", insertIdx);
  if (!(gParentInfo.id in newChildren)) {
    newChildren[gParentInfo.id] = gParentInfo.children;
  }
  newChildren[gParentInfo.id] = [
    ...newChildren[gParentInfo.id].slice(0, insertIdx),
    paramInfo.id,
    ...newChildren[gParentInfo.id].slice(insertIdx),
  ];
  numChildrenInserted[gParentInfo.id] += 1;
}

function onPush(computeFn) {
  return () => {
    const activeSections = useActiveSection.getState().ids;
    if (activeSections.length !== 1) {
      return;
    }
    const sectionId = activeSections[0];
    let selectedParams = getAllSelectedParams(sectionId);
    const newCodeInfoChildren = {};
    const numChildrenInserted = {};
    for (const p of selectedParams) {
      computeFn(p, newCodeInfoChildren, sectionId, numChildrenInserted);
    }
    console.log("newCodeInfoChildren", newCodeInfoChildren);
    batchUpdateCodeInfoChildren(sectionId, newCodeInfoChildren);
  };
}

export function indentSelectedParams() {
  onPush(computeNewChildrenForRightPush)();
}
