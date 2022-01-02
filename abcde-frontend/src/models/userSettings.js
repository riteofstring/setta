import { action } from "easy-peasy";
import { SWITCH } from "utils/constants";

const userSettings = {
  datatypeToUIType: { bool: SWITCH },

  setDatatypeToUIType: action((state, payload) => {
    const { datatype, uiType } = payload;
    state.datatypeToUIType[datatype] = uiType;
  }),
};

export default userSettings;
