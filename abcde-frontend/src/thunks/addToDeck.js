import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";

export function addToDeck({ deckId, idsToAdd }) {
  useSectionInfos.getState().setAllChildren({
    sectionId: deckId,
    newStateFn: (x) => [...x, ...idsToAdd],
  });
  useProjectConfig.getState().deleteChildren(idsToAdd);
}
