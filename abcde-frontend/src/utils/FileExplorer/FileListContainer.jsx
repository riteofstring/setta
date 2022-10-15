import { VStack } from "@chakra-ui/react";

export default function FileListContainer(props) {
  const group = props.group;
  return (
    <VStack
      h="inherit"
      w={props.width}
      border="1px"
      borderColor="gray.200"
      borderRadius="lg"
      spacing={0}
      align="stretch"
      overflowY="auto"
      px="1.5rem"
      py="1rem"
      {...group}
    >
      {props.children}
    </VStack>
  );
}
