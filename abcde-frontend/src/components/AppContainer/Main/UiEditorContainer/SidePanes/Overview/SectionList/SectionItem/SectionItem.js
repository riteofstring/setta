import { DragHandleIcon } from "@chakra-ui/icons";
import { Text, HStack } from "@chakra-ui/react";
import {
  useRequestSectionPositionUpdate,
  useSetGoToCoordinates,
} from "hooks/useGetSectionPosition";
import { useReactFlow, useStoreApi } from "react-flow-renderer";
import { OVERVIEW } from "utils/constants";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const requestPositionUpdate = useRequestSectionPositionUpdate(
    sectionId,
    OVERVIEW
  );

  useSetGoToCoordinates(sectionId, OVERVIEW);

  const onClick = () => {
    requestPositionUpdate();
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
        borderRadius="0.5rem"
        _hover={{
          boxShadow: "inset 0px 0px 0px 10px gray.500",
          bg: "gray.400",
          color: "gray.50",
        }}
        onClick={onClick}
      >
        {sectionHeading}
      </Text>
    </HStack>
  );
}
