import { SearchIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Spacer,
  Stack,
  VStack,
} from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useGetParamChildId, useGetParamUIType } from "hooks/useParamInfo";
import { useGetCurrObjParamKwargInfos } from "hooks/useSectionContents";
import { cloneNewUIType } from "hooks/useUITypeCoreFunctions";
import React, { useState } from "react";
import { SET_FROM_SIDEPANE } from "utils/constants";
import { USER } from "utils/uiTypeConstants";

import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

export default React.memo(UIConfig);

function UIConfig() {
  const sectionId = useStoreState((x) => x.activeSection.id);
  const paramInfos = useGetCurrObjParamKwargInfos(sectionId);

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
            key={`${e.name}-${idx}`}
          />
        ))}
    </VStack>
  );
}

function UIElement({ sectionId, paramInfo }) {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const deleteUIType = useStoreActions((x) => x.uiTypes.deleteUIType);
  const paramInfoId = paramInfo.id;
  const paramChildId = useGetParamChildId(sectionId, paramInfoId);
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const setParamUITypeId = useStoreActions((x) => x.thunks.setParamUITypeId);
  const setParamUITypeConfig = useStoreActions(
    (x) => x.thunks.setParamUITypeConfig
  );
  const paramName = paramInfo.name;

  const onSelect = (e) => {
    setParamUITypeId({
      uiTypeId: e,
      sectionId,
      paramInfoId,
    });
  };

  const onChange = (configName, newValueFn) => {
    setParamUITypeConfig({
      sectionId,
      paramInfoId,
      configProps: { configName, newValueFn },
    });
  };

  function onSaveAsSubmit(presetName) {
    const newUIType = cloneNewUIType({
      uiType,
      name: presetName,
      presetType: USER,
    });
    setUIType({ uiType: newUIType });
    setParamUITypeId({
      uiTypeId: newUIType.id,
      sectionId,
      paramInfoId,
    });
    // delete old uitype if its a non-preset
    if (!uiType.presetType) {
      deleteUIType({ uiTypeId: uiType.id });
    }
  }

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
      <SaveLoadButtons onSubmit={onSaveAsSubmit} />
    </VStack>
  );
}

function SaveLoadButtons({ onSubmit }) {
  return (
    <Stack spacing={3} direction="row" pb="1.5rem">
      <Spacer />
      <Popover>
        <PopoverTrigger>
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
        </PopoverTrigger>
        <PopoverContent>
          <PopoverArrow />
          <PopoverBody>
            <SubmitAsPreset onSubmit={onSubmit} />
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </Stack>
  );
}

function SubmitAsPreset({ onSubmit }) {
  const [presetName, setPresetName] = useState("");

  function onChange(e) {
    setPresetName(e.target.value);
  }

  function localOnSubmit() {
    onSubmit(presetName);
  }

  return (
    <>
      <Input placeholder="Preset Name" onChange={onChange} value={presetName} />
      <Button onClick={localOnSubmit}>Done</Button>
    </>
  );
}
