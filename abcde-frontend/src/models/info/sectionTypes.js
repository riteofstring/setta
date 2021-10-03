import { action } from "easy-peasy";

import { SimpleHistory } from "../../classes/simpleHistory";
import { SectionType } from "../../classes/uiType";

const sectionTypes = {
  x: new SimpleHistory(1, (id) => new SectionType({ id })),

  setSectionType: action((state, payload) => {
    const { sectionTypeId, sectionType } = payload;
    state.x.h[sectionTypeId] = sectionType;
  }),

  setConfigId: action((state, payload) => {
    const { sectionTypeId, configId } = payload;
    state.x.h[sectionTypeId].configId = configId;
  }),
};

export default sectionTypes;
