import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { LIST, LIST_ROOT } from "../../../../utils/constants";
import { createNewId } from "../../../../utils/sectionIds";
import {
  useCreateSectionInfo,
  useGetSectionInfo,
} from "../../../../utils/useCreateInfo";
import { useIdsOverview } from "../../../../utils/useIdsOverview";
import { insertIntoArrayOrXpend } from "../../../../utils/utils";

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);

  const type = useStoreState((x) => x.sections.type[sectionId]);
  const sectionInfo = useGetSectionInfo(sectionId);
  const sectionInfoId = useStoreState(
    (x) => x.sections.sectionInfoId[sectionId]
  );

  const setSectionInfoId = useStoreActions((x) => x.sections.setSectionInfoId);
  const setIdsOverview = useIdsOverview(sectionId)[1];
  const setType = useStoreActions((x) => x.sections.setType);
  const setChildId = useStoreActions((x) => x.paramInfos.setChildId);
  const createInfo = useCreateSectionInfo();

  function addChild({
    childVariableName = null,
    uiType = null,
    uiTypeConfig = null,
    startId = null,
    numChildren = 1,
    parentParamInfoId = null,
  }) {
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
        let config = uiTypeConfig;
        if (parentIsSection) {
          if (config === null) {
            config = sectionInfo.specs;
          }
          if (uiType.isListRoot) {
            setType({ sectionId: newId, type: LIST_ROOT });
          }
        } else {
          config = uiSpecs.get(childVariableName);
        }
        const newInfoId = createInfo(childVariableName, config);
        setSectionInfoId({ sectionId: newId, sectionInfoId: newInfoId });
      }
    }

    setIdsOverview((x) => {
      let insertIdx = null;
      if (startId !== null) {
        insertIdx = x.indexOf(startId) + 1;
      }
      return insertIntoArrayOrXpend(x, insertIdx, prepend, ...newIds);
    });

    if (parentParamInfoId) {
      setChildId({ paramInfoId: parentParamInfoId, childId: newIds[0] });
    }
  }

  return addChild;
}

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sections.deleteSections);
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
