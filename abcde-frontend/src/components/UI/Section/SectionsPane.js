import { Stack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import React from "react";

import { PANEID } from "../../../utils/constants";
import { useSetSectionPosition } from "../../../utils/useSetSectionPosition";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  const refForPosition = useSetSectionPosition(PANEID);

  console.log("pageMinMaxList", pageMinMaxList);

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
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
