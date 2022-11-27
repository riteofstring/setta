import { thunk } from "easy-peasy";
import _ from "lodash";

function getNewStateFn(deletedChildren, numChildren, startId) {
  return (x) => {
    if (x.length === 0) {
      return x;
    }
    let startIdx = 0;
    if (startId !== null) {
      startIdx = x.indexOf(startId);
    }
    const endIdx = startIdx + numChildren;
    deletedChildren[0] = x.filter((e, idx) => idx >= startIdx && idx < endIdx);
    return _.difference(x, deletedChildren[0]);
  };
}

export const deleteChild = thunk((action, payload, helpers) => {
  const { sectionId, numChildren = 1, startId = null } = payload;
  const a = helpers.getStoreActions();

  // For deleting root sections, in which case the parent (sectionid) is "null"
  if (_.isNil(sectionId)) {
    a.sectionInfos.deleteSections({ sectionIds: [startId] });
    return;
  }

  // deletedChildren is a list so that it can be operated on by reference
  // deletedChildren[0] is set to be the list of the children to delete
  let deletedChildren = [null];
  a.sectionInfos.setAllChildren({
    sectionId,
    newStateFn: getNewStateFn(deletedChildren, numChildren, startId),
  });

  a.sectionInfos.deleteSections({ sectionIds: deletedChildren[0] });
});
