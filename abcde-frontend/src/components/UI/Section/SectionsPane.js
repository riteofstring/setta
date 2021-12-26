import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useState } from "react";

import { useSectionGroups } from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { MultipleContainers } from "../../../utils/MultipleDND/MultipleContainers";
import { PANEID } from "../../../utils/constants";

function SectionsPane() {
  const groups = useSectionGroups(true); // array of [groupId, group]
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setChildren = useStoreActions((x) => x.sectionInfos.setChildrenInfo);
  const moveIdBetweenGroups = useStoreActions(
    (x) => x.sectionInfos.moveIdBetweenGroups
  );

  const [items, setItems] = useState(groups);

  const [containers, setContainers] = useState(Object.keys(items));

  return (
    <div ref={refForPosition}>
      <MultipleContainers
        items={items}
        setItems={setItems}
        containers={containers}
        setContainers={setContainers}
      />
    </div>
  );
}

export default React.memo(SectionsPane);
