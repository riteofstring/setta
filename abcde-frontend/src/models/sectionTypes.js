import { action } from "easy-peasy";

import { SectionType } from "../classes/uiType";
import { createDefaultNestedDict } from "../utils/utils";

const sectionTypes = {
  sectionType: createDefaultNestedDict(1, (id) => new SectionType({ id })),
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
