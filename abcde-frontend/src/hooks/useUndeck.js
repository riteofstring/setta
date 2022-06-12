import { useStoreActions } from "easy-peasy";

import { useIdsOverview } from "./useIdsOverview";

export function useUndeck(sectionId) {
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);

  return () => {
    setIdsOverview((x) => []);
    setSectionInfoAttr({
      sectionIds: idsOverview,
      attr: "isTopLevel",
      value: true,
    });
    deleteSections({ sectionIds: [sectionId] });
  };
}
