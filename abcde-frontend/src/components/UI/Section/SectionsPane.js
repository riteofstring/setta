import { Stack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, {useState} from "react";

import { useSectionGroups } from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import {MultipleContainers} from "../../../utils/MultipleDND/MultipleContainers"
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";
import { createRange } from "../../../utils/MultipleDND/createRange";

function SectionsPane() {
  const groups = useSectionGroups(true); // array of [groupId, group]
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setChildren = useStoreActions((x) => x.sectionInfos.setChildrenInfo);
  const moveIdBetweenGroups = useStoreActions(
    (x) => x.sectionInfos.moveIdBetweenGroups
  );

  const [items, setItems] = useState({
    A: createRange(3, (index) => `A${index + 1}`),
    B: createRange(4, (index) => `B${index + 1}`),
    C: createRange(2, (index) => `C${index + 1}`),
    D: createRange(5, (index) => `D${index + 1}`),
  });

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
