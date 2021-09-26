import { insertIntoArrayOrXpend } from "../../../../utils/utils";
import _ from "lodash";
import { SectionInfo } from "../../../../classes/jsonParser";
import { createNewId } from "../../../../utils/sectionIds";
import { useStoreState, useStoreActions } from "easy-peasy";
import { useIdsOverview } from "../../../../utils/useIdsOverview";

export function useAddChild(sectionId, parentIsSection = true, prepend = true) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const available = useStoreState((x) => x.master.available);
  const sectionInfo = useStoreState((x) => x.sections.sectionInfo[sectionId]);
  const setSectionInfo = useStoreActions((x) => x.sections.setSectionInfo);
  const setIdsOverview = useIdsOverview(sectionId)[1];

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
      if (!childVariableName) {
        childVariableName = sectionInfo.name;
      }
      let [config, isList, isListRoot] = [null, null, null];
      if (parentIsSection) {
        if (!uiType) {
          ({ specs: config, isList, isListRoot } = sectionInfo);
          // isList = true if parent is list root, false otherwise
          isList = isListRoot;
          isListRoot = false;
        } else {
          ({ config, isList, isListRoot } = uiType);
        }
      } else {
        config = uiSpecs.get(childVariableName);
      }

      const newSectionInfo = new SectionInfo(
        childVariableName,
        config,
        available,
        isList,
        isListRoot
      );
      setSectionInfo({ sectionId: newId, sectionInfo: newSectionInfo });
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
