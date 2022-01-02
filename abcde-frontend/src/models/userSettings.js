import { action } from "easy-peasy";
import { SLIDER, SWITCH } from "utils/constants";

const userSettings = {
  sectionsPerGroup: 5,
  datatypeToUIType: { bool: SWITCH, float: SLIDER },

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),

  setDatatypeToUIType: action((state, payload) => {
    const { datatype, uiType } = payload;
    state.datatypeToUIType[datatype] = uiType;
  }),
};

export default userSettings;
