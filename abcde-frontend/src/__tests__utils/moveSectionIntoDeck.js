import { DECK_UI_TYPE_ID } from "utils/constants";
import {
  renderUseCreateDefaultSectionInfo,
  renderUseIdsOverview,
} from "./renderHooks";

export function moveSectionIntoDeck(store, wrapper, sectionId, deckId) {
  store.getActions().sectionInfos.moveChildThunk({
    newParentId: deckId,
    childId: sectionId,
    newIndex: 0,
  });
  // necessary to update currChildren
  renderUseIdsOverview(deckId, wrapper);
}

export function createDeck(wrapper, name) {
  let result = null;
  ({ result } = renderUseCreateDefaultSectionInfo(wrapper));

  const [newId] = result.current({
    name,
    isTopLevel: true,
    uiTypeId: DECK_UI_TYPE_ID,
  });
  return newId;
}
