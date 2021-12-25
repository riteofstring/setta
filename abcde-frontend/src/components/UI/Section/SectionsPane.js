import { Stack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import React from "react";

import { useSectionGroups } from "../../../hooks/useCreateInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const groups = useSectionGroups(true); // array of [groupId, group]
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
            groupId={e[0]}
            sectionIds={e[1]}
            idx={idx}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
