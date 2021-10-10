import { Stack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import React from "react";

import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const groups = useStoreState((x) => x.master.groups);
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);

  const refForPosition = useSetSectionPosition(PANEID);

  console.log("groups", groups);

  return (
    <>
      <Stack
        direction="row"
        spacing={`${spaceBetweenPages}px`}
        ref={refForPosition}
      >
        {groups.map((e, idx) => (
          <SingleSectionsPane
            groupId={idx}
            sectionIds={e}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
