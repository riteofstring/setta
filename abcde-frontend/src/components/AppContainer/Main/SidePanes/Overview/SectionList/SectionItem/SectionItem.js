import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";

export default function SectionItem({ sectionHeading, isList, isListRoot }) {
  return (
    <HStack py="0.125rem">
      {isList && !isListRoot ? <DragHandleIcon cursor="move" size="sm" color="gray.200" /> : <></>}
      <Text>{sectionHeading}</Text>
    </HStack>
  );
}
