import { SearchIcon } from "@chakra-ui/icons";
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
  InputGroup,
  InputLeftElement,
  Input,
} from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useParamChildId } from "hooks/useParamInfo";
import {
  useGetObjInfos,
  useGetAllParamAndKwargInfos,
} from "hooks/useSectionContents";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetParamUIType, useSetUIType } from "hooks/useUIType";
import ReduceMotionAccordian from "utils/ReduceMotionAccordian/ReduceMotionAccordian";
import { SET_FROM_SIDEPANE } from "utils/constants";

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
      <InputGroup pb="1rem">
        <InputLeftElement
          pointerEvents="none"
          children={<SearchIcon color="gray.300" />}
        />
        <Input variant="flushed" placeholder="Search" />
      </InputGroup>
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
  const paramChildId = childIdFn(paramInfo.id)[0];
  const uiType = getUITypeFn(paramInfo.id);
  const [setUITypeId, setConfig] = useSetUIType({
    sectionId,
    paramInfoId: paramInfo.id,
    defaultName: paramInfo.name,
    childId: paramChildId,
    currUIType: uiType,
    settingSectionConfig: false,
  });
  const paramName = paramInfo.name;

  const onSelect = (e) => {
    setUITypeId(e);
  };

  const onChange = (configName, newValueFn) => {
    setConfig({ configName, newValueFn });
  };

  return (
    <ReduceMotionAccordian
      defaultIndex={[0]}
      allowMultiple
      borderTopColor="transparent"
      borderBottomColor="transparent"
    >
      <AccordionItem>
        <AccordionButton
          // _expanded={{ color: "gray.400" }}
          color="gray.500"
          _hover={{ bg: "white", boxShadow: "sm" }}
          borderRadius="md"
        >
          <Box flex="1" textAlign="left">
            <Heading
              as="h3"
              size="sm"
              color="gray.500"
              textTransform="uppercase"
              letterSpacing="widest"
            >
              {paramName}
            </Heading>
          </Box>
          <AccordionIcon />
        </AccordionButton>

        <AccordionPanel
          px={0}
          pt={2}
          pb={4}
          width="100%"
          display="flex"
          alignItems="stretch"
          flexDir="column"
        >
          <UIConfigDropdownAndFields
            onDropdownSelect={onSelect}
            selectedId={uiType.id}
            selectedType={uiType.type}
            onConfigChange={onChange}
            paramInfoId={paramInfo.id}
            savedConfig={uiType.config}
            childIdFn={childIdFn}
            origin={SET_FROM_SIDEPANE}
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
      <Button variant="solid" size="sm">
        Save
      </Button>
    </Stack>
  );
}
