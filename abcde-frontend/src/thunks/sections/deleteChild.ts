import _ from "lodash";
import { deleteSections } from "./sectionOps";
import { setAllChildren } from "./sections";

function getNewStateFn(
  deletedChildren: string[],
  numChildren: number,
  startId: string | null
) {
  return (x) => {
    if (x.length === 0) {
      return x;
    }
    const startIdx = startId !== null ? x.indexOf(startId) : 0;
    const endIdx = startIdx + numChildren;
    deletedChildren[0] = x.filter((e, idx) => idx >= startIdx && idx < endIdx);
    return _.difference(x, deletedChildren[0]);
  };
}

export function deleteChild({
  parentId,
  numChildren = 1,
  startId = null,
}: DeleteChildFnType) {
  // For deleting root sections, in which case the parent (sectionid) is "null"
  if (_.isNil(parentId)) {
    deleteSections({ sectionIds: [startId] });
    return;
  }

  // deletedChildren is a list so that it can be operated on by reference
  // deletedChildren[0] is set to be the list of the children to delete
  const deletedChildren = [];
  setAllChildren(
    parentId,
    getNewStateFn(deletedChildren, numChildren, startId)
  );

  deleteSections({ sectionIds: deletedChildren[0] });
}

// if sectionId is null, then startId must be specified
type DeleteChildFnType =
  | {
      parentId: string;
      numChildren?: number;
      startId?: string | null;
    }
  | {
      parentId: null | undefined;
      numChildren?: number;
      startId: string;
    };
