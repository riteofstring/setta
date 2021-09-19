import { action, thunk } from "easy-peasy";
import { SimpleHistory } from "../classes/simpleHistory";
import { createNewId } from "../utils/sectionIds";
import { SectionInfo } from "../classes/jsonParser";
import { defaultDict, insertIntoArrayOrPrepend } from "../utils/utils";
import _ from "lodash";

const sections = {
  enteredValues: new SimpleHistory(3, undefined),
  idsOverview: {},
  idNames: {},
  children: defaultDict(() => []),

  setEnteredValue: action((state, payload) => {
    const { sectionId, selected, paramName, value } = payload;
    state.enteredValues.history[sectionId][selected][paramName] = value;
  }),

  setIdsOverview: action((state, payload) => {
    const { sectionId, children } = payload;
    state.idsOverview[sectionId] = children;
  }),

  setIdNames: action((state, payload) => {
    const { sectionId, name } = payload;
    state.idNames[sectionId] = name;
  }),

  setChildren: action((state, payload) => {
    const { sectionId, children } = payload;
    state.children[sectionId] = children;
  }),

  addChild: thunk((action, payload, helpers) => {
    let {
      sectionId,
      sectionInfo,
      available,
      childSectionInfo,
      setChildSectionInfo,
      childVariableName,
      uiType,
      startId = null,
      numChildren = 1,
    } = payload;

    const state = helpers.getState();
    const children = state.children[sectionId];

    let newIds = [];
    let newInfos = {};
    for (let i = 0; i < numChildren; i++) {
      const newId = createNewId();
      action.setChildren({ sectionId: newId, children: [] });
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
    action.setChildren({
      sectionId,
      children: insertIntoArrayOrPrepend(children, insertIdx, ...newIds),
    });
    setChildSectionInfo({
      ...newInfos,
      ...childSectionInfo,
    });
  }),

  deleteChild: thunk((action, payload, helpers) => {
    let {
      sectionId,
      childSectionInfo,
      setChildSectionInfo,
      startId = null,
      numChildren = 1,
    } = payload;
    const state = helpers.getState();
    const children = state.children[sectionId];
    console.log("deleteChild", sectionId, startId, numChildren)
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
    console.log("newChildren", newChildren)
    setChildSectionInfo(_.pick(childSectionInfo, newChildren));
    action.setChildren({ sectionId, children: newChildren });
  }),
};

export default sections;
