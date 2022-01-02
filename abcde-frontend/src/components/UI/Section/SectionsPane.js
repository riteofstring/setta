
import { useStoreActions, useStoreState } from "easy-peasy";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import { PANEID } from "utils/constants";

import {
  useGroupsHaveUpdated,
  useSectionGroups,
} from "hooks/useCreateInfo";
import { MultipleContainers } from "utils/MultipleDND/MultipleContainers";

function SectionsPane() {
  const { groupIds, setGroupIds, groups } = useSectionGroups(true);
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setGroupChildren = useStoreActions((x) => x.master.setGroupChildren);
  const [groupsHaveUpdated, setGroupsHaveUpdated] = useGroupsHaveUpdated();

  return (
    <div ref={refForPosition}>
      <MultipleContainers
        groups={groups}
        setGroups={setGroupChildren}
        containers={groupIds}
        setContainers={setGroupIds}
        groupsHaveUpdated={groupsHaveUpdated}
        setGroupsHaveUpdated={setGroupsHaveUpdated}
      />
    </div>
  );
}

export default React.memo(SectionsPane);
