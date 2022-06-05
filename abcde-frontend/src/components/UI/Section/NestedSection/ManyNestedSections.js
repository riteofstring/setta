import { HStack, Box, VStack } from "@chakra-ui/react";
import React from "react";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";

import { NestedSection } from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  setChildren,
  dummy,
}) {
  return (
    <DNDSortable items={childIds} setItems={setChildren}>
      <HStack alignItems="stretch">
        <Box
          w="12px"
          bg="whiteAlpha.300"
          borderRadius="full"
          minH="100%"
          _hover={{ bg: "whiteAlpha.500", cursor: "pointer" }}
          mb=".25rem"
        />
        <VStack spacing="0">
          {childIds.map((e, idx) => (
            <NestedSection
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
              dummy={dummy}
              idxForList={idx}
            />
          ))}
        </VStack>
      </HStack>
    </DNDSortable>
  );
}
