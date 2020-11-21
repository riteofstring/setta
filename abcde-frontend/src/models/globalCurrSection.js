import { action, thunk, debug } from "easy-peasy";

const globalCurrSection = {
  prevSectionName: null,
  currSectionName: null,
  sectionChanged: false,
  globalCurrSection: {},

  // actions

  // compare currSectionName to prevSectionName to determine if User has changed sections.
  setCurrSectionName: action((state, payload) => {
    state.prevSectionName = state.currSectionName;
    state.currSectionName = payload;
    state.sectionChanged =
      state.prevSectionName && state.prevSectionName !== state.currSectionName;
    // console.log("globalCurrSection", debug(state.globalCurrSection));
  }),

  // if user has changed sections, update previous section.
  _setGlobalCurrSection: action((state, payload) => {
    if (state.sectionChanged) {
      state.globalCurrSection[state.prevSectionName] = payload;
    }
    console.log("globalCurrSection", debug(state.globalCurrSection));
  }),

  // update globalCurrSection state with latest globalCurrModule
  setGlobalCurrSectionThunk: thunk((action, payload, helpers) => {
    const { globalCurrModule } = helpers.getStoreState().globalCurrModule;
    action._setGlobalCurrSection(globalCurrModule);
  }),
};

export default globalCurrSection;
