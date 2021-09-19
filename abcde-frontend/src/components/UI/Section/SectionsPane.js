import React, { useEffect } from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { PANEID } from "../../../utils/constants";
import { useSetSectionPosition } from "../../../utils/useSetSectionPosition";
import { Stack } from "@chakra-ui/react";
import { useAtomValue } from "jotai/utils";
import { groupChildren as groupChildrenState } from "./state";

function SectionsPane() {
  const available = useStoreState((state) => state.master.available);
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );
  const groupChildren = useAtomValue(groupChildrenState);
  const refForPosition = useSetSectionPosition(PANEID);

  console.log("pageMinMaxList", pageMinMaxList);
  console.log("groupChildren", groupChildren);

  return (
    <>
      <Stack
        direction="row"
        spacing={`${spaceBetweenPages}px`}
        ref={refForPosition}
      >
        {pageMinMaxList.map((e, idx) => (
          <SingleSectionsPane
            minIdx={e.minIdx}
            maxIdx={e.maxIdx}
            groupId={idx}
            groupChildren={groupChildren[idx]}
            available={available}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
