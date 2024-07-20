import { createProjectState } from "./utils";

export const constInfoViews = {
  OVERVIEW: "Click on a section name to pan to it.",
  NAVBAR_SEARCH: "Search your entire project from one location.",
  BUTTON_GENERATE: "Generate command to run your project.",
  OVERVIEW_PROJNAME:
    "Your Project's Name and Config Name, editable all in one spot!",
  OVERVIEW_SEARCH: "Search through your project's cards.",
  SECTIONCONFIG_CARDTYPES_SEARCH:
    "Select your card's type. Options include: Object, List of Objects, Dictionary of Objects, and Info. The Info Card only takes in Markdown text.",
  SECTIONCONFIG_CONTENTS_SEARCH:
    "Choose which arguments appear in your selected card.",
};

const initialState = { currValue: "" };

export const useInfoView = createProjectState((set) => ({
  ...initialState,
  setCurr: (value) => set({ currValue: value }),
}));
