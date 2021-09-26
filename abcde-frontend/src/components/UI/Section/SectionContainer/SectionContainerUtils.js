import { insertIntoArrayOrPrepend } from "../../../../utils/utils";
import _ from "lodash";
import { SectionInfo } from "../../../../classes/jsonParser";
import { createNewId } from "../../../../utils/sectionIds";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useIdsOverview } from "../../../../utils/useIdsOverview";

export function useAddChild(sectionId) {
  const available = useStoreState((x) => x.master.available);
  const sectionInfo = useStoreState((x) => x.sections.sectionInfo[sectionId]);
  const setSectionInfo = useStoreActions((x) => x.sections.setSectionInfo);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);

  function addChild(
    childVariableName,
    uiType,
    startId = null,
    numChildren = 1
  ) {
    let newIds = [];
    let newInfos = {};
    for (let i = 0; i < numChildren; i++) {
      const newId = createNewId();
      newIds.push(newId);
      if (!childVariableName) {
        childVariableName = sectionInfo.name;
      }
      let [config, isList, isListRoot] = [null, null, null];
      if (!uiType) {
        ({ specs: config, isList, isListRoot } = sectionInfo);
        if (isListRoot) {
          isList = true;
          isListRoot = false;
        }
      } else {
        ({ config, isList, isListRoot } = uiType);
      }
      newInfos[newId] = new SectionInfo(
        childVariableName,
        config,
        available,
        isList,
        isListRoot
      );
    }

    let insertIdx = null;
    if (startId !== null) {
      insertIdx = idsOverview.indexOf(startId) + 1;
    }
    setIdsOverview(insertIntoArrayOrPrepend(idsOverview, insertIdx, ...newIds));
    for (let k of Object.keys(newInfos)) {
      setSectionInfo({ sectionId: k, sectionInfo: newInfos[k] });
    }
  }
  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sections.deleteSections);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);

  function deleteChild(startId = null, numChildren = 1) {
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
    setIdsOverview(newChildren);
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
