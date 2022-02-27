import { action } from "easy-peasy";

const userSettings = {
  sectionsPerGroup: 5,

  setSectionsPerGroup: action((state, payload) => {
    state.sectionsPerGroup = payload;
  }),
};

export default userSettings;
