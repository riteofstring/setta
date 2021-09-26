import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { SectionInfo } from "../../../../classes/jsonParser";
import { createNewId } from "../../../../utils/sectionIds";
import { useIdsOverview } from "../../../../utils/useIdsOverview";
import { insertIntoArrayOrXpend } from "../../../../utils/utils";

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const available = useStoreState((x) => x.master.available);
  const isListRoot = useStoreState((x) => x.sections.isListRoot[sectionId]);
  const sectionInfo = useStoreState((x) => x.sections.sectionInfo[sectionId]);
  const sectionInfoId = useStoreState(
    (x) => x.sections.sectionInfoId[sectionId]
  );
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setSectionInfoId = useStoreActions((x) => x.sections.setSectionInfoId);
  const setIdsOverview = useIdsOverview(sectionId)[1];
  const setIsList = useStoreActions((x) => x.sections.setIsList);
  const setIsListRoot = useStoreActions((x) => x.sections.setIsListRoot);

  function addChild(
    childVariableName,
    uiType,
    startId = null,
    numChildren = 1
  ) {
    let newIds = [];
    for (let i = 0; i < numChildren; i++) {
      const newId = createNewId();
      newIds.push(newId);
      if (isListRoot) {
        // use parent section info
        setSectionInfoId({ sectionId: newId, sectionInfoId });
        setIsList({ sectionId: newId, isList: true });
      } else {
        if (!childVariableName) {
          childVariableName = sectionInfo.name;
        }
        let config = null;
        if (parentIsSection) {
          if (!uiType) {
            ({ specs: config } = sectionInfo);
          } else {
            ({ config } = uiType);
            setIsListRoot({ sectionId: newId, isListRoot: uiType.isListRoot });
          }
        } else {
          config = uiSpecs.get(childVariableName);
        }
        const newSectionInfo = new SectionInfo(
          childVariableName,
          config,
          available
        );
        const newInfoId = createNewId();
        setSectionInfo({
          sectionInfoId: newInfoId,
          sectionInfo: newSectionInfo,
        });
        setSectionInfoId({ sectionId: newId, sectionInfoId: newInfoId });
      }
    }

    let insertIdx = null;
    setIdsOverview((x) => {
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, prepend, ...newIds);
    });
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
