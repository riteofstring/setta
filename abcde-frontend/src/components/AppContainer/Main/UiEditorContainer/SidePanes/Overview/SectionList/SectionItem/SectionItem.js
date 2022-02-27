import { DragHandleIcon } from "@chakra-ui/icons";
import { Text, HStack } from "@chakra-ui/react";
import { useStore } from "easy-peasy";
import { motion, animate, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import {
  useStore as useReactFlowStore,
  useZoomPanHelper,
} from "react-flow-renderer";
import useDeepCompareEffect from "use-deep-compare-effect";

export default function SectionItem({ sectionId, sectionHeading, isList }) {
  // const reactFlowInstance = useStore((x) => x.reactFlow.instance);
  // console.log("reactFlowInstance", reactFlowInstance)
  const reactFlowStore = useReactFlowStore();
  const { transform: setTransform } = useZoomPanHelper();

  // https://reactflow.dev/examples/use-zoom-pan-helper-hook/
  const onClick = () => {
    const { nodes, transform } = reactFlowStore.getState();
    const node = _.filter(nodes, { id: sectionId })[0];
    const x = node.__rf.position.x + node.__rf.width / 2;
    const y = node.__rf.position.y + node.__rf.height / 2;

    console.log(transform[0], x)

    animate(transform[0], x, {
      type: "spring",
      duration: 0.2,
      onUpdate: (v) => {
        setTransform({ x: v, y: transform[1], zoom: 1 });
      },
    });
    // animate(currY, y, {
    //   type: "spring",
    //   duration: 0.2,
    //   onUpdate: (v) => {
    //     setGoToCoords((s) => ({ y: v, ...s }));
    //   },
    // });
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
