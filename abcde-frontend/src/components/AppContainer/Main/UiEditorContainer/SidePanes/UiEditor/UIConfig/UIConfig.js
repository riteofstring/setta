import {
  Heading,
  VStack,
  Button,
  Stack,
  Spacer,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
} from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import {
  useGetAllParamAndKwargInfos,
  useGetObjInfos,
  useGetParamUIType,
  useGetSectionInfo,
  useParamChildId,
  useSetUITypeConfig,
} from "hooks/useCreateInfo";
import ReduceMotionAccordian from "utils/ReduceMotionAccordian/ReduceMotionAccordian";

import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

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
          <UIElement
            sectionId={sectionId}
            paramInfo={e}
            getUITypeFn={getUITypeFn}
            key={`${e.name}-${idx}`}
          />
        ))}
    </VStack>
  );
}

function UIElement({ sectionId, paramInfo, getUITypeFn }) {
  const childIdFn = useParamChildId(sectionId);
  const uiType = getUITypeFn(paramInfo);
  const uiTypeConfig = uiType.config;
  const setUITypeConfig = useSetUITypeConfig(uiType);
  const paramName = paramInfo.name;

  const setName = useStoreActions((x) => x.uiTypes.setName);

  const onSelect = (e) => {
    setName({ uiTypeId: uiType.id, name: e });
  };

  const onChange = (configName, newValueFn) => {
    setUITypeConfig({ configName, newValueFn });
  };

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
              {paramName}
            </Heading>
          </Box>
          <AccordionIcon />
        </AccordionButton>

        <AccordionPanel pb={4}>
          <UIConfigDropdownAndFields
            onDropdownSelect={onSelect}
            currSelected={uiType.name}
            onConfigChange={onChange}
            paramInfoId={paramInfo.id}
            savedConfig={uiTypeConfig}
            childIdFn={childIdFn}
          />
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
