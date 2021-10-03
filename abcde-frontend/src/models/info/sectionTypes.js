import { action } from "easy-peasy";

import { SectionType } from "../../classes/sectionType";
import { SimpleHistory } from "../../classes/simpleHistory";

const sectionTypes = {
  x: new SimpleHistory(1, (id) => new SectionType({ id })),

  setSectionType: action((state, payload) => {
    const { sectionTypeId, sectionType } = payload;
    state.x.h[sectionTypeId] = sectionType;
  }),
};

export default sectionTypes;
