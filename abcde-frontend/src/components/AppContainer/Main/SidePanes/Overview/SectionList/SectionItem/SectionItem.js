import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions } from "easy-peasy";

export default function SectionItem({
  sectionId,
  sectionHeading,
  isList,
  isListRoot,
}) {
  const setGoToHeight = useStoreActions(
    (actions) => actions.mapInteraction.setGoToHeight
  );
  const getCurrPositionOfSection = useStoreActions(
    (actions) => actions.sectionSizes.getCurrPositionOfSection
  );

  const onClick = () => {
    setGoToHeight(getCurrPositionOfSection(sectionId));
  };

  return (
    <HStack py="0.125rem">
      <DragHandleIcon
        cursor="move"
        size="sm"
        color="gray.200"
        visibility={isList && !isListRoot ? "visible" : "hidden"}
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
