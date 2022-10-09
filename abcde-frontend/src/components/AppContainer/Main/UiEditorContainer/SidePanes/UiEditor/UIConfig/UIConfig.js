import { SearchIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Spacer,
  Stack,
  VStack,
} from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useParamChildId } from "hooks/useParamInfo";
import { useGetCurrObjParamKwargInfos } from "hooks/useSectionContents";
import { useGetParamUIType, useSetUIType } from "hooks/useUIType";
import React from "react";
import { SET_FROM_SIDEPANE } from "utils/constants";

import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

export default React.memo(UIConfigFunc);

function UIConfigFunc() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const paramInfos = useGetCurrObjParamKwargInfos(sectionId);
  const getUITypeFn = useGetParamUIType(sectionId);

  const [filteredList, setFilter] = useMatchSorterFilter(
    paramInfos,
    ["name"],
    500
  );

  return (
    <VStack align="stretch" spacing={0}>
      <InputGroup pb="2.5rem">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <Input
          variant="flushed"
          placeholder="Search"
          onChange={(e) => setFilter(e.target.value)}
        />
      </InputGroup>
      {filteredList.length > 0 &&
        filteredList.map((e, idx) => (
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
  const paramInfoId = paramInfo.id;
  const paramChildId = childIdFn(paramInfoId)[0];
  const uiType = getUITypeFn(paramInfoId);
  const [setUITypeId, setConfig] = useSetUIType({
    sectionId,
    paramInfoId,
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
    <VStack
      align="stretch"
      _hover={{
        "&:hover .uiconfig-param-save-as": {
          visibility: "visible",
          opacity: "1",
          transitionDuration: "opacity 0.5s",
        },
      }}
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

      <UIConfigDropdownAndFields
        onDropdownSelect={onSelect}
        selectedId={uiType.id}
        selectedType={uiType.type}
        onConfigChange={onChange}
        savedConfig={uiType.config}
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        paramChildId={paramChildId}
        origin={SET_FROM_SIDEPANE}
      />
      <SaveLoadButtons />
    </VStack>
  );
}

function SaveLoadButtons() {
  return (
    <Stack spacing={3} direction="row" pb="1.5rem">
      <Spacer />
      <Button
        variant="outline"
        size="xs"
        color="gray.500"
        className="uiconfig-param-save-as"
        visibility="hidden"
        opacity="0"
      >
        Save As
      </Button>
    </Stack>
  );
}
