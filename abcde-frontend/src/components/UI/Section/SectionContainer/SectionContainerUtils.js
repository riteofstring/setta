import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { createSectionInfo } from "../../../../classes/infoFactory";
import { LIST, LIST_ROOT } from "../../../../utils/constants";
import { createNewId } from "../../../../utils/sectionIds";
import { useIdsOverview } from "../../../../utils/useIdsOverview";
import { insertIntoArrayOrXpend } from "../../../../utils/utils";

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const available = useStoreState((x) => x.master.available);
  const type = useStoreState((x) => x.sections.type[sectionId]);
  const sectionInfo = useStoreState((x) => x.sections.sectionInfo[sectionId]);
  const sectionInfoId = useStoreState(
    (x) => x.sections.sectionInfoId[sectionId]
  );
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setSectionInfoId = useStoreActions((x) => x.sections.setSectionInfoId);
  const setIdsOverview = useIdsOverview(sectionId)[1];
  const setType = useStoreActions((x) => x.sections.setType);

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
      if (type === LIST_ROOT) {
        // parent is list root, so use parent section info
        setSectionInfoId({ sectionId: newId, sectionInfoId });
        setType({ sectionId: newId, type: LIST });
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
            if (uiType.isListRoot) {
              setType({ sectionId: newId, type: LIST_ROOT });
            }
          }
        } else {
          config = uiSpecs.get(childVariableName);
        }
        const [newSectionInfo, newInfoId] = createSectionInfo(
          childVariableName,
          config,
          available
        );
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
