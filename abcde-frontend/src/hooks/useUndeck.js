import { useStoreActions } from "easy-peasy";

export function useUndeck() {
  const getDeckChildrenThunk = useStoreActions(
    (x) => x.sectionInfos.getDeckChildrenThunk
  );
  const setIdsOverviewThunk = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);

  return (sectionId) => {
    const childIds = getDeckChildrenThunk({ sectionId });
    setIdsOverviewThunk({ sectionId, newStateFn: (x) => [] });
    setSectionInfoAttr({
      sectionIds: childIds,
      attr: "isTopLevel",
      value: true,
    });
    deleteSections({ sectionIds: [sectionId] });
  };
}
