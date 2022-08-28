import { DECK_UI_TYPE_ID } from "utils/constants";
import { callMoveChildThunk } from "./createStoreWrapperWithData";
import {
  renderUseCreateDefaultSectionInfo,
  renderUseIdsOverview,
} from "./renderHooks";

export function moveSectionIntoDeck(store, wrapper, sectionIds, deckId) {
  sectionIds.forEach((v, i) => {
    callMoveChildThunk(store, wrapper, {
      newParentId: deckId,
      childId: v,
      newIndex: i,
    });
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
