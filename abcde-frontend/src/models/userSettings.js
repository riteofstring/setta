import { action } from "easy-peasy";
import { SWITCH } from "utils/constants";

const userSettings = {
  sectionsPerGroup: 5,
  datatypeToUIType: { bool: SWITCH },

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),

  setDatatypeToUIType: action((state, payload) => {
    const { datatype, uiType } = payload;
    state.datatypeToUIType[datatype] = uiType;
  }),
};

export default userSettings;
