import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

export const ConstantInfoView = {
  OVERVIEW: "OVERVIEW",
  OVERVIEW_SEARCH: "OVERVIEW_SEARCH",
  OVERVIEW_PROJNAME: "OVERVIEW_PROJNAME",
  NAVBAR_SEARCH: "NAVBAR_SEARCH",
  BUTTON_GENERATE: "BUTTON_GENERATE",
  BUTTON_COMMUNITY: "BUTTON_COMMUNITY",
  SECTIONCONFIG_CARDTYPES_SEARCH: "SECTIONCONFIG_CARDTYPES_SEARCH",
  SECTIONCONFIG_CONTENTS_SEARCH: "SECTIONCONFIG_CONTENTS_SEARCH",
};

const constantInfoViews = {
  [ConstantInfoView.OVERVIEW]: "Click on a section name to pan to it.",
  [ConstantInfoView.NAVBAR_SEARCH]:
    "Search your entire project from one location.",
  [ConstantInfoView.BUTTON_GENERATE]: "Generate command to run your project.",
  [ConstantInfoView.BUTTON_COMMUNITY]:
    "Discover templates provided by the Runcoder Community.",
  [ConstantInfoView.OVERVIEW_PROJNAME]:
    "Your Project's Name and Config Name, editable all in one spot!",
  [ConstantInfoView.OVERVIEW_SEARCH]: "Search through your project's cards.",
  [ConstantInfoView.SECTIONCONFIG_CARDTYPES_SEARCH]:
    "Select your card's type. Options include: Object, List of Objects, Dictionary of Objects, and Info. The Info Card only takes in Markdown text.",
  [ConstantInfoView.SECTIONCONFIG_CONTENTS_SEARCH]:
    "Choose which arguments appear in your selected card.",
};

const initialState = { x: constantInfoViews, currId: null };

export const useInfoView = createProjectState(
  immer((set) => ({
    ...initialState,
    setInfo: ({ id, value }) =>
      set((state) => {
        state.x[id] = value;
      }),
    setCurr: (id) =>
      set((state) => {
        state.currId = id;
      }),
  }))
);

export function useSetCurrInfoView(id) {
  const setCurr = useInfoView((x) => x.setCurr);

  function onMouseOver() {
    setCurr(id);
  }

  function onMouseLeave() {
    setCurr(null);
  }

  return { onMouseOver, onMouseLeave };
}

export function useCurrInfoView() {
  return useInfoView((x) => (x.currId ? x.x[x.currId] : ""));
}
