import React, { useEffect } from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { Heading, Stack } from "@chakra-ui/react";
import { useIdsOverview } from "../../../utils/useIdsOverview";
import { useAddChild } from "./SectionContainer/SectionContainerUtils";

function SingleSectionsPane({ minIdx, maxIdx, groupId }) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const idsOverview = useIdsOverview(groupId)[0];
  const addChild = useAddChild(groupId, false, false);

  useEffect(() => {
    for (let idx = minIdx; idx < Math.min(maxIdx, uiSpecs.size); idx++) {
      const variableName = [...uiSpecs.keys()][idx];
      addChild(variableName);
    }
  }, []);

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {groupId}
        </Heading>
        {idsOverview.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            // nextId={idx + 1}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
