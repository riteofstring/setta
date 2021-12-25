import { Heading, Stack } from "@chakra-ui/react";
import React from "react";

import { useSetChildrenInfo } from "../../../hooks/useIdsOverview";
import { DNDSortable } from "../../../utils/DNDSortable/DNDSortable";
import { SortableSectionContainer } from "./SectionContainer/SortableSectionContainer";

function SingleSectionsPane({ groupId, sectionIds, idx }) {
  const setChildren = useSetChildrenInfo(groupId);
  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {idx}
        </Heading>
        <DNDSortable items={sectionIds} setItems={setChildren}>
          {sectionIds.map((e, idx) => (
            <SortableSectionContainer
              sectionId={e}
              parentId={null}
              key={`${e}-${idx}`}
              depth={0}
            />
          ))}
        </DNDSortable>
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
