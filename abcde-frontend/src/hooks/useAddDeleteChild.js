import { useStoreActions } from "easy-peasy";
import _ from "lodash";
import { useSetIdsOverview } from "./useIdsOverview";

export function useDeleteChild(sectionId) {
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const setIdsOverview = useSetIdsOverview(sectionId);

  function deleteChild({ numChildren = 1, startId = null }) {
    // For deleting root sections, in which case the parent (sectionid) is "null"
    if (_.isNil(sectionId)) {
      deleteSections({ sectionIds: [startId] });
      return;
    }

    let deletedChildren = null;
    setIdsOverview((x) => {
      if (x.length === 0) {
        return x;
      }
      let startIdx = 0;
      if (startId !== null) {
        startIdx = x.indexOf(startId);
      }
      const endIdx = startIdx + numChildren;
      deletedChildren = x.filter((e, idx) => idx >= startIdx && idx < endIdx);
      return _.difference(x, deletedChildren);
    });
    deleteSections({ sectionIds: deletedChildren });
  }
  return deleteChild;
}
