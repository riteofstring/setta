import { action } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";
import { SectionType } from "../classes/uiType";

const sectionTypes = {
  sectionType: new SimpleHistory(1, () => new SectionType({})),
  configId: {},

  setSectionType: action((state, payload) => {
    const { sectionTypeId, sectionType } = payload;
    state.sectionType.h[sectionTypeId] = sectionType;
  }),

  setConfigId: action((state, payload) => {
    const { sectionTypeId, configId } = payload;
    state.configId[sectionTypeId] = configId;
  }),
};

export default sectionTypes;
