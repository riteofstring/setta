import { Text, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";

export default function SectionItem({sectionName}) {
  return (
    <HStack py="0.125rem">
      <DragHandleIcon cursor="move" size="sm" color="gray.200" />
      <Text>{sectionName}</Text>
    </HStack>
  );
}
