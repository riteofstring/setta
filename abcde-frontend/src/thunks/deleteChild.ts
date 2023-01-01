import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { deleteSections } from "./sectionOps";

function getNewStateFn(
  deletedChildren: string[],
  numChildren: number,
  startId: string | null
) {
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

export function deleteChild({
  sectionId,
  numChildren = 1,
  startId = null,
}: DeleteChildFnType) {
  // For deleting root sections, in which case the parent (sectionid) is "null"
  if (_.isNil(sectionId)) {
    deleteSections({ sectionIds: [startId] });
    return;
  }

  // deletedChildren is a list so that it can be operated on by reference
  // deletedChildren[0] is set to be the list of the children to delete
  const deletedChildren = [];
  useSectionInfos.getState().setAllChildren({
    sectionId,
    newStateFn: getNewStateFn(deletedChildren, numChildren, startId),
  });

  deleteSections({ sectionIds: deletedChildren[0] });
}

// if sectionId is null, then startId must be specified
type DeleteChildFnType =
  | {
      sectionId: string;
      numChildren?: number;
      startId?: string | null;
    }
  | {
      sectionId: null | undefined;
      numChildren?: number;
      startId: string;
    };
