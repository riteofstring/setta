import { useStoreActions, useStoreState } from "easy-peasy";
import React from "react";

import {
  useGroupsHaveUpdated,
  useSectionGroups,
} from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { MultipleContainers } from "../../../utils/MultipleDND/MultipleContainers";
import { PANEID } from "../../../utils/constants";

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
