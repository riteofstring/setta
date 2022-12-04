import { thunk } from "easy-peasy";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";

export const addToDeck = thunk((actions, payload, helpers) => {
  const { deckId, idsToAdd } = payload;

  useSectionInfos.getState().setAllChildren({
    sectionId: deckId,
    newStateFn: (x) => [...x, ...idsToAdd],
  });
  useProjectConfig.getState().deleteChildren(idsToAdd);
});
