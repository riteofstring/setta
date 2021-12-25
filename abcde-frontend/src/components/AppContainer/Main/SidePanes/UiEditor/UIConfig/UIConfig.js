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
import { useStoreState } from "easy-peasy";

import {
  useGetAllParamAndKwargInfos,
  useGetObjInfos,
  useGetParamUIType,
  useGetSectionInfo,
} from "../../../../../../hooks/useCreateInfo";
import ReduceMotionAccordian from "../../../../../../utils/ReduceMotionAccordian";

export default function UIConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const objInfoId = useGetSectionInfo(sectionId).selectedItem;
  const objInfo = useGetObjInfos(sectionId, objInfoId);
  const paramInfos = useGetAllParamAndKwargInfos(sectionId, objInfo);
  const getUITypeFn = useGetParamUIType(sectionId);

  console.log("activeSectionId", sectionId);

  return (
    <VStack align="stretch" spacing={0}>
      {paramInfos &&
        paramInfos.length > 0 &&
        paramInfos.map((e, idx) => (
          <UIElement uiName={e.name} key={`${e.name}-${idx}`} />
        ))}
    </VStack>
  );
}

function UIElement({ uiName = "UI Element" }) {
  return (
    <ReduceMotionAccordian defaultIndex={[0]} allowMultiple>
      <AccordionItem isOpen={true}>
        <Heading as="h2" size="md">
          <AccordionButton>
            <Box flex="1" textAlign="left">
              {uiName}
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </Heading>
        <AccordionPanel pb={4}>
          <Input placeholder="UI Preset Search" />
          <Input placeholder="UI Type Search" />
          <HStack>
            <Input variant="flushed" placeholder="Min" />
            <Input variant="flushed" placeholder="Max" />
            <Input variant="flushed" placeholder="Step" />
          </HStack>
          <SaveLoadButtons />
        </AccordionPanel>
      </AccordionItem>
    </ReduceMotionAccordian>
  );
}

function SaveLoadButtons() {
  return (
    <Stack spacing={3} direction="row" pt="1.125rem">
      <Spacer />
      <Button variant="outline">Apply To...</Button>
      <Button variant="outline">Load</Button>
      <Button variant="solid">Save</Button>
    </Stack>
  );
}
