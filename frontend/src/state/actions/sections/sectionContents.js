import { useCodeInfo } from "state/definitions";

export function getTopLevelParamInfos(sectionId) {
  const cState = useCodeInfo.getState().x;
  const selectedItem = getSectionSelectedItem(sectionId);
  const objParamInfoIds = selectedItem
    ? findAllParametersOfCallables(cState, [selectedItem])
    : [];

  const { codeInfoId } = getSectionInfo(sectionId);
  const paramCollectionIds = findAllParametersOfCollections(
    useCodeInfo.getState().x,
    [codeInfoId],
  );

  return [...objParamInfoIds, ...paramCollectionIds];
}

export function getAllParamInfos(sectionId) {
  const topLevel = getTopLevelParamInfos(sectionId);
  return findAllParameters(useCodeInfo.getState().x, topLevel);
}

function movePinnedToFront(params) {
  const pinnedObjects = [];
  const unpinnedObjects = [];

  // Separate objects into pinned and unpinned arrays
  params.forEach((p) => {
    if (p.isPinned) {
      pinnedObjects.push(p);
    } else {
      unpinnedObjects.push(p);
    }
  });

  // Concatenating the pinned and unpinned objects
  return pinnedObjects.concat(unpinnedObjects);
}
