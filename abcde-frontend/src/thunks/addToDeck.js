import { thunk } from "easy-peasy";

export const addToDeck = thunk((actions, payload, helpers) => {
  const { deckId, idsToAdd } = payload;
  const a = helpers.getStoreActions();

  a.sectionInfos.setAllChildren({
    sectionId: deckId,
    newStateFn: (x) => [...x, ...idsToAdd],
  });
  a.projectConfig.deleteChildren(idsToAdd);
});
