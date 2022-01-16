import { useStoreActions, useStoreState } from "easy-peasy";

export function useSectionGroups(returnAsMapping = false) {
  const groupIds = useStoreState((x) => x.master.groupIds);
  const setGroupIds = useStoreActions((x) => x.master.setGroupIds);
  let groups = useStoreState(
    (x) => _.compact(groupIds.map((y) => x.master.groupChildren[y])),
    _.isEqual
  );
  if (returnAsMapping) {
    groups = _.zipObject(groupIds, groups);
  }
  return { groupIds, setGroupIds, groups };
}

export function useGroupsHaveUpdated() {
  const groupsHaveUpdated = useStoreState((x) => x.master.groupsHaveUpdated);
  const setGroupsHaveUpdated = useStoreActions(
    (x) => x.master.setGroupsHaveUpdated
  );
  return [groupsHaveUpdated, setGroupsHaveUpdated];
}
