export const PositionDropType = {
  INTO: "INTO",
  ABOVE: "ABOVE",
  BELOW: "BELOW",
};

export const BehaviorDropType = {
  INVALID: "INVALID",
  DROP_HERE: "DROP_HERE", //for dropping within the same list
  NEW_LIST_ELEMENT: "NEW_LIST_ELEMENT",
  NEW_ARG: "NEW_ARG",
  EXISTING_ARG: "EXISTING_ARG",
};

export const behaviorToPretty = {
  INVALID: "Invalid",
  DROP_HERE: "Drop Here",
  NEW_LIST_ELEMENT: "New List Element",
  NEW_ARG: "New Arg",
  EXISTING_ARG: "Existing Arg",
};
