import C from "constants/constants.json";
import { useCodeInfo } from "state/definitions";
import { getSectionTypeConfig } from "state/getters/sectionInfo";
import { findAll } from "utils/getDescendants";

export function getAllSelectedParams(sectionId) {
  const codeInfos = findAll(useCodeInfo.getState().x, [
    getSectionTypeConfig(sectionId).codeInfoId,
  ]);
  return {
    codeInfos,
    selectedParams: codeInfos.filter(
      (x) => x.rcType === C.PARAMETER && x.isSelected,
    ),
  };
}

export function computeNewChildrenForRightPush(
  codeInfos,
  paramInfo,
  newChildren,
) {
  const parentInfo = codeInfos.find((x) => x.children.includes(paramInfo.id));
  if (parentInfo.isSelected) {
    return;
  }

  const siblingList = parentInfo.children;
  const paramIdx = siblingList.indexOf(paramInfo.id);
  let prevUnselectedSiblingIdx = -1;
  for (let i = paramIdx - 1; i >= 0; i--) {
    if (!useCodeInfo.getState().x[siblingList[i]].isSelected) {
      prevUnselectedSiblingIdx = i;
      break;
    }
  }
  if (prevUnselectedSiblingIdx < 0) {
    return;
  }
  const siblingInfo =
    useCodeInfo.getState().x[siblingList[prevUnselectedSiblingIdx]];

  if (!(parentInfo.id in newChildren)) {
    newChildren[parentInfo.id] = parentInfo.children;
  }
  newChildren[parentInfo.id] = newChildren[parentInfo.id].filter(
    (x) => x !== paramInfo.id,
  );

  if (!(siblingInfo.id in newChildren)) {
    newChildren[siblingInfo.id] = siblingInfo.children;
  }
  newChildren[siblingInfo.id] = [...newChildren[siblingInfo.id], paramInfo.id];
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

export function computeNewChildrenForVerticalPush(direction) {
  return (codeInfos, paramInfo, newChildren) => {
    const parentInfo = codeInfos.find((x) => x.children.includes(paramInfo.id));
    if (!(parentInfo.id in newChildren)) {
      const siblingList = parentInfo.children;
      newChildren[parentInfo.id] = siblingList.slice();
    }

    const x = newChildren[parentInfo.id];
    const index = x.indexOf(paramInfo.id);
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (
      newIndex < 0 ||
      newIndex >= x.length ||
      useCodeInfo.getState().x[x[newIndex]].isSelected
    ) {
      return;
    }

    [x[newIndex], x[index]] = [x[index], x[newIndex]]; // swap elements
  };
}
