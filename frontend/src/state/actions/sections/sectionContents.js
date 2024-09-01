import { useCodeInfo, useSectionToParamIds } from "state/definitions";

export function getParamInfos(sectionId) {
  const ids = useSectionToParamIds.getState().params[sectionId] ?? [];
  const cState = useCodeInfo.getState().x;
  return ids.map((x) => cState[x]);
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
