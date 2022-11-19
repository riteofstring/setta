import { thunk } from "easy-peasy";

export const addToDeck = thunk((actions, payload, helpers) => {
  const { deckId, idsToAdd } = payload;
  const a = helpers.getStoreActions();

  a.sectionInfos.setIdsOverview({
    sectionId: deckId,
    newStateFn: (x) => [...x, ...idsToAdd],
  });
  a.sectionInfos.setSectionInfoAttr({
    sectionIds: idsToAdd,
    attr: "isTopLevel",
    value: false,
  });
});
