import { DragHandleIcon } from "@chakra-ui/icons";
import { Text, HStack } from "@chakra-ui/react";
import { useGoToSection } from "hooks/useGetSectionPosition";
import { OVERVIEW } from "utils/constants";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const goToSection = useGoToSection(sectionId, OVERVIEW);

  const onClick = () => {
    goToSection();
  };

  return (
    <HStack py="0.125rem">
      <DragHandleIcon
        cursor="move"
        size="sm"
        color="gray.200"
        visibility={isList ? "visible" : "hidden"}
      />

      <Text
        cursor="pointer"
        py={0.5}
        px={2}
        w="100%"
        borderRadius="0.25rem"
        color="gray.500"
        _hover={{
          boxShadow: "inset 0px 0px 0px 10px gray.500",
          bg: "gray.100",
          // color: "gray.50",
        }}
        onClick={onClick}
      >
        {sectionHeading}
      </Text>
    </HStack>
  );
}
