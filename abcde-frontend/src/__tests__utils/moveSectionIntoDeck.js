import { getSectionByName } from "./createStoreWrapperWithData";
import { renderUseIdsOverview } from "./renderHooks";

export function moveSectionIntoDeck(store, wrapper, sectionId) {
  const deck = getSectionByName(store, "Deck");
  store.getActions().sectionInfos.moveChildThunk({
    newParentId: deck.id,
    childId: sectionId,
    newIndex: 0,
  });
  // necessary to update currChildren
  renderUseIdsOverview(deck.id, wrapper);
}
