import { thunk } from "easy-peasy";
import { useProjectConfig } from "models/info/projectConfig";

export const addToDeck = thunk((actions, payload, helpers) => {
  const { deckId, idsToAdd } = payload;
  const a = helpers.getStoreActions();

  a.sectionInfos.setAllChildren({
    sectionId: deckId,
    newStateFn: (x) => [...x, ...idsToAdd],
  });
  useProjectConfig.getState().deleteChildren(idsToAdd);
});
