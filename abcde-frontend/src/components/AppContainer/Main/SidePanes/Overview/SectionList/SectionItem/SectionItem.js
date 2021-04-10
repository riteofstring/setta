import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import { SECTIONWIDTH } from "../../../../../../../utils/constants";

export default function SectionItem({
  sectionId,
  sectionHeading,
  isList,
  pageNum,
}) {
  const spaceBetweenPages = useStoreState(
    (state) => state.master.spaceBetweenPages
  );

  const setGoToCoordinates = useStoreActions(
    (actions) => actions.mapInteraction.setGoToCoordinates
  );
  const getCurrPositionOfSection = useStoreActions(
    (actions) => actions.sectionPositions.getCurrPositionOfSection
  );

  const onClick = async () => {
    const goToHeight = await getCurrPositionOfSection(sectionId);
    setGoToCoordinates({
      y: -goToHeight,
      x: -(pageNum - 1) * (spaceBetweenPages + SECTIONWIDTH),
    });
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
