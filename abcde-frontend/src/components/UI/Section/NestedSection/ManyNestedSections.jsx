import { Box, HStack, Stack } from "@chakra-ui/react";
import { useGoToSection } from "hooks/useGetSectionPosition";
import { INDICATOR_GOTO_PARENT } from "utils/constants";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";
import SectionContainer from "../SectionContainer/SectionContainer";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  isDeck,
}) {
  const goToSection = useGoToSection(sectionId, INDICATOR_GOTO_PARENT);

  const onClick = () => {
    goToSection();
  };

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
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
            zIndex="200"
          />
        )}

        <Stack spacing="0.5rem" alignItems="flex-start">
          {childIds.map((e, idx) => (
            <SectionContainer
              parentId={sectionId}
              sectionId={e}
              nextId={childIds[idx + 1]}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
            />
          ))}
        </Stack>
      </HStack>
    </DNDSortable>
  );
}
