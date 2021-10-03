import { useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createNewId } from "../../../../utils/sectionIds";
import { useCreateSectionInfo } from "../../../../utils/useCreateInfo";
import { useIdsOverview } from "../../../../utils/useIdsOverview";
import { insertIntoArrayOrXpend } from "../../../../utils/utils";

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const setIdsOverview = useIdsOverview(sectionId)[1];
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const setIsRendered = useStoreActions((x) => x.sectionInfos.setIsRendered);
  const createInfo = useCreateSectionInfo(sectionId, parentIsSection);

  function addChild({
    name = null,
    uiType = null,
    uiTypeConfig = null,
    startId = null,
    numChildren = 1,
    parentParamInfoId = null,
  }) {
    let newIds = [];
    for (let i = 0; i < numChildren; i++) {
      const id = createNewId();
      newIds.push(id);
      createInfo({ name, id, uiType, uiTypeConfig });
    }

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, prepend, ...newIds);
    });

    setIsRendered((x) => {
      const trueArray = new Array(newIds.length).fill(true);
      const newIsRendered = _.zipObject(newIds, trueArray);
      return { ...x, ...newIsRendered };
    });

    if (parentParamInfoId) {
      setChildId({
        sectionId,
        paramInfoId: parentParamInfoId,
        childId: newIds[0],
      });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);

  function deleteChild({ startId = null, numChildren = 1 }) {
    if (idsOverview.length === 0) {
      return;
    }
    let startIdx = 0;
    if (startId !== null) {
      startIdx = idsOverview.indexOf(startId);
    }
    const endIdx = startIdx + numChildren;
    const newChildren = idsOverview.filter(
      (e, idx) => !(idx >= startIdx && idx < endIdx)
    );
    setIdsOverview((x) => newChildren);
    deleteSections({ sectionIds: _.difference(idsOverview, newChildren) });
  }
  return deleteChild;
}

export function funcFlipChildrenAreCollapsed(
  childrenAreCollapsed,
  setChildrenAreCollapsed
) {
  function flipChildrenAreCollapsed() {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }
  return flipChildrenAreCollapsed;
}
