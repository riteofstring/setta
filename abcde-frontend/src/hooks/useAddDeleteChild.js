import { useStoreActions } from "easy-peasy";
import { insertIntoArrayOrXpend } from "utils/utils";

import { useCreateSectionInfo } from "./useCreateInfo";
import { useSetIdsOverview } from "./useIdsOverview";
import { useGetSectionInfo } from "./useSectionInfo";

export function useAddChild(sectionId) {
  const { paramCollectionId: collectionId } = useGetSectionInfo(sectionId);
  const setIdsOverview = useSetIdsOverview(sectionId);
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const createInfo = useCreateSectionInfo(sectionId);

  function addChild({
    name = null,
    uiTypeId,
    numChildren = 1,
    parentParamInfoId = null,
    startId = null,
  }) {
    const newIds = createInfo({
      name,
      uiTypeId,
      numChildren,
      paramInfoId: parentParamInfoId,
    });

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
    });

    if (parentParamInfoId) {
      setChildId({
        collectionId,
        paramInfoId: parentParamInfoId,
        childId: newIds[0],
      });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const setIdsOverview = useSetIdsOverview(sectionId);

  function deleteChild({ numChildren = 1, startId = null }) {
    let deletedChildren = null;
    setIdsOverview((x) => {
      if (x.length === 0) {
        return x;
      }
      let startIdx = 0;
      if (startId !== null) {
        startIdx = x.indexOf(startId);
      }
      const endIdx = startIdx + numChildren;
      deletedChildren = x.filter((e, idx) => idx >= startIdx && idx < endIdx);
      return _.difference(x, deletedChildren);
    });
    deleteSections({ sectionIds: deletedChildren });
  }
  return deleteChild;
}
