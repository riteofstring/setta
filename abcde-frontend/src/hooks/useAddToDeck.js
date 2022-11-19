import { useStoreActions } from "easy-peasy";

export function useAddToDeck() {
  const setIdsOverview = useStoreActions((x) => x.sectionInfos.setIdsOverview);
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );

  return (deckId, idsToAdd) => {
    setIdsOverview({
      sectionId: deckId,
      newStateFn: (x) => [...x, ...idsToAdd],
    });
    setSectionInfoAttr({
      sectionIds: idsToAdd,
      attr: "isTopLevel",
      value: false,
    });
  };
}
