import React from "react";
import { useStoreState } from "easy-peasy";
import SingleSectionsPane from "./SingleSectionsPane";
import { PANEID } from "../../../utils/constants";
import { useSetSectionPosition } from "../../../utils/useSetSectionPosition";
import { Stack } from "@chakra-ui/react";

function SectionsPane(){
  const available = useStoreState((state) => state.master.available);
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
            available={available}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
};

export default React.memo(SectionsPane);
