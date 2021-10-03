import { action } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";
import { SectionType } from "../classes/uiType";
import { createDefaultNestedDict } from "../utils/utils"

const sectionTypes = {
  sectionType: createDefaultNestedDict(1, () => new SectionType({})),
  configId: {},

  setSectionType: action((state, payload) => {
    const { sectionTypeId, sectionType } = payload;
    state.sectionType[sectionTypeId] = sectionType;
  }),

  setConfigId: action((state, payload) => {
    const { sectionTypeId, configId } = payload;
    state.configId[sectionTypeId] = configId;
  }),
};

export default sectionTypes;
