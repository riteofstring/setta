import { DragHandleIcon } from "@chakra-ui/icons";
import { Text, HStack } from "@chakra-ui/react";
import { useReactFlow, useStoreApi } from "react-flow-renderer";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const store = useStoreApi();
  const { setCenter } = useReactFlow();

  const focusNode = () => {
    const { nodeInternals } = store.getState();

    const node = nodeInternals.get(sectionId);
    const x = node.position.x + node.width / 2;
    const y = node.position.y + node.height / 2;
    const zoom = 1;

    setCenter(x, y, { zoom, duration: 100 });
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
        onClick={focusNode}
      >
        {sectionHeading}
      </Text>
    </HStack>
  );
}
