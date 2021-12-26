import { Stack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useState } from "react";

import { useSectionGroups } from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { MultipleContainers } from "../../../utils/MultipleDND/MultipleContainers";
import { createRange } from "../../../utils/MultipleDND/createRange";
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const groups = useSectionGroups(true); // array of [groupId, group]
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setChildren = useStoreActions((x) => x.sectionInfos.setChildrenInfo);
  const moveIdBetweenGroups = useStoreActions(
    (x) => x.sectionInfos.moveIdBetweenGroups
  );

  const [items, setItems] = useState(groups);

  console.log("items", groups);

  const [containers, setContainers] = useState(Object.keys(items));

  return (
    <>
      <MultipleContainers
        items={items}
        setItems={setItems}
        containers={containers}
        setContainers={setContainers}
      />
    </>
  );
}

export default React.memo(SectionsPane);
