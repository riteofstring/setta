import {
  Heading,
  Input,
  VStack,
  HStack,
  Button,
  Stack,
  Spacer,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
} from "@chakra-ui/react";
import ReduceMotionAccordian from "utils/ReduceMotionAccordian";

export default function UIConfigFunc() {
  return (
    <VStack align="stretch" spacing={0}>
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
      <UIElement />
    </VStack>
  );
}

function UIElement({ uiName = "UI Element" }) {
  return (
    <ReduceMotionAccordian
      defaultIndex={[0]}
      allowMultiple
      borderTopColor="white"
      borderBottomColor="gray.100"
    >
      <AccordionItem>
        <AccordionButton>
          <Box flex="1" textAlign="left">
            <Heading as="h3" size="sm" color="gray.500">
              {uiName}
            </Heading>
          </Box>
          <AccordionIcon />
        </AccordionButton>

        <AccordionPanel pb={4}>
          <Input placeholder="UI Preset Search" bg="white" />
          <HStack pt=".5rem">
            <Input variant="flushed" placeholder="Min" size="sm" />
            <Input variant="flushed" placeholder="Max" size="sm" />
            <Input variant="flushed" placeholder="Step" size="sm" />
          </HStack>
          <SaveLoadButtons />
        </AccordionPanel>
      </AccordionItem>
    </ReduceMotionAccordian>
  );
}

function SaveLoadButtons() {
  return (
    <Stack spacing={3} direction="row" pt="1.125rem" pb="2rem">
      <Spacer />
      <Button variant="outline" size="sm">
        Apply To...
      </Button>
      <Button variant="outline" size="sm">
        Load
      </Button>
      <Button variant="solid" size="sm">
        Save
      </Button>
    </Stack>
  );
}
