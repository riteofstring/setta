import { DragHandleIcon } from "@chakra-ui/icons";
import { Text, HStack } from "@chakra-ui/react";
import {
  useStore as useReactFlowStore,
  useZoomPanHelper,
} from "react-flow-renderer";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  const reactFlowStore = useReactFlowStore();
  const { setCenter } = useZoomPanHelper();

  // https://reactflow.dev/examples/use-zoom-pan-helper-hook/
  const onClick = () => {
    const { nodes } = reactFlowStore.getState();
    const node = _.filter(nodes, { id: sectionId })[0];
    const x = node.__rf.position.x + node.__rf.width / 2;
    const y = node.__rf.position.y + node.__rf.height / 2;
    const zoom = 1;

    setCenter(x, y, zoom);
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
