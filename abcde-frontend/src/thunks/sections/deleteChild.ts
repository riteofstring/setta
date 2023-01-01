import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { deleteSections } from "./sectionOps";

function getNewStateFn(
  deletedChildren: string[],
  numChildren: number,
  startId: string | null,
  deleteStartIdOnly: boolean
) {
  return (x) => {
    if (x.length === 0) {
      return x;
    }
    const startIdx = startId !== null ? x.indexOf(startId) : -1;
    const endIdx = startIdx + numChildren;
    deletedChildren[0] = x.filter((e, idx) =>
      deleteStartIdOnly ? idx === startIdx : idx <= endIdx && idx > startIdx
    );
    return _.difference(x, deletedChildren[0]);
  };
}

function deleteChildSectionStates({
  parentId,
  numChildren,
  startId,
  deleteStartIdOnly = false,
}) {
  // deletedChildren is a list so that it can be operated on by reference
  // deletedChildren[0] is set to be the list of the children to delete
  const deletedChildren = [];
  useSectionInfos.getState().setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(
      deletedChildren,
      numChildren,
      startId,
      deleteStartIdOnly
    ),
  });

  deleteSections({ sectionIds: deletedChildren[0] });
}

export function deleteSelf({ parentId, sectionId }) {
  // For deleting root sections, in which case the parent (sectionid) is "null"
  if (_.isNil(parentId)) {
    deleteSections({ sectionIds: [sectionId] });
    return;
  }
  deleteChildSectionStates({
    parentId,
    numChildren: 1,
    startId: sectionId,
    deleteStartIdOnly: true,
  });
}

export function deleteChild({
  parentId,
  numChildren = 1,
  startId = null,
}: {
  parentId: string | null;
  numChildren?: number;
  startId?: string | null;
}) {
  deleteChildSectionStates({ parentId, numChildren, startId });
}
