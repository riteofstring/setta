import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions } from "easy-peasy";

export default function SectionItem({ sectionHeading, isList, isListRoot, positionTop }) {

  const setGoToHeight = useStoreActions((actions) => actions.mapInteraction.setGoToHeight);

  return (
    <HStack py="0.125rem">
      {isList && !isListRoot ? <DragHandleIcon cursor="move" size="sm" color="gray.200" /> : <></>}
      <Text onClick={() => setGoToHeight(positionTop)}>{sectionHeading}</Text>
    </HStack>
  );
}
