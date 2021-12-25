import { Stack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React from "react";

import { useSectionGroups } from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { DNDSortableWithoutSortableContext } from "../../../utils/DNDSortable/DNDSortable";
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const groups = useSectionGroups(true); // array of [groupId, group]
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);
  const setChildren = useStoreActions((x) => x.sectionInfos.setChildrenInfo);
  const swapIdsBetweenGroups = useStoreActions(
    (x) => x.sectionInfos.swapIdsBetweenGroups
  );

  console.log("groups", groups);

  return (
    <>
      <Stack
        direction="row"
        spacing={`${spaceBetweenPages}px`}
        ref={refForPosition}
      >
        <DNDSortableWithoutSortableContext
          setItems={setChildren}
          swapIdsBetweenGroups={swapIdsBetweenGroups}
        >
          {groups.map((e, idx) => (
            <SingleSectionsPane
              groupId={e[0]}
              sectionIds={e[1]}
              idx={idx}
              key={`SingleSectionsPane-${idx}`}
            />
          ))}
        </DNDSortableWithoutSortableContext>
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
