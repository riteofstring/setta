import { insertIntoArrayOrPrepend } from "../../../../utils/utils";
import _ from "lodash";
import { SectionInfo } from "../../../../classes/jsonParser";
import { createNewId } from "../../../../utils/sectionIds";

export function funcAddChild(
  sectionInfo,
  available,
  children,
  setChildren,
  setChildSectionInfo
) {
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
      insertIdx = children.indexOf(startId) + 1;
    }
    setChildren(insertIntoArrayOrPrepend(children, insertIdx, ...newIds));
    for (let k of Object.keys(newInfos)) {
      setChildSectionInfo({ sectionId: k, sectionInfo: newInfos[k] });
    }
  }
  return addChild;
}

export function funcDeleteChild(children, setChildren, deleteSections) {
  function deleteChild(startId = null, numChildren = 1) {
    if (children.length === 0) {
      return;
    }
    let startIdx = 0;
    if (startId !== null) {
      startIdx = children.indexOf(startId);
    }
    const endIdx = startIdx + numChildren;
    const newChildren = children.filter(
      (e, idx) => !(idx >= startIdx && idx < endIdx)
    );
    setChildren(newChildren);
    deleteSections({ sectionIds: _.difference(children, newChildren) });
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
