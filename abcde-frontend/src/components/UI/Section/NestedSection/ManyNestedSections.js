import { HStack, Box, VStack } from "@chakra-ui/react";
import { useGoToSection } from "hooks/useGetSectionPosition";
import React from "react";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import { INDICATOR_GOTO_PARENT } from "utils/constants";

import { NestedSection } from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  setChildren,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId, INDICATOR_GOTO_PARENT);

  const onClick = () => {
    goToSection();
  };

  return (
    <DNDSortable items={childIds} setItems={setChildren}>
      <HStack alignItems="stretch">
        {!isDeck && (
          <Box
            w="12px"
            bg="whiteAlpha.300"
            borderRadius="full"
            minH="100%"
            _hover={{ bg: "whiteAlpha.500", cursor: "pointer" }}
            mb=".25rem"
            onClick={onClick}
          />
        )}

        <VStack spacing="0">
          {childIds.map((e, idx) => (
            <NestedSection
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
            />
          ))}
        </VStack>
      </HStack>
    </DNDSortable>
  );
}
