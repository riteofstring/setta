import { Heading, Stack } from "@chakra-ui/react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import React from "react";

import { SortableSectionContainer } from "./SectionContainer/SortableSectionContainer";

function SingleSectionsPane({ groupId, sectionIds, idx }) {
  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {idx}
        </Heading>
        <SortableContext
          items={sectionIds}
          strategy={verticalListSortingStrategy}
          id={groupId}
        >
          {sectionIds.map((e, idx) => (
            <SortableSectionContainer
              sectionId={e}
              parentId={null}
              key={`${e}-${idx}`}
              depth={0}
            />
          ))}
        </SortableContext>
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
