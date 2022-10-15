import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  InputGroup,
  InputLeftElement,
  InputRightElement,
} from "@chakra-ui/react";

import { ChevronDownIcon, SearchIcon } from "@chakra-ui/icons";

import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetUIType } from "hooks/useUIType";
import React from "react";

import SectionConfigComp from "./SectionConfigComp";
import SectionConfigTypeSelection from "./SectionConfigTypeSelection";

export default React.memo(SectionConfig);

function SectionConfig() {
  const sectionId = useStoreState((x) => x.master.activeSection);
  const setActiveSection = useStoreActions((x) => x.master.setActiveSection);
  const cameFromUIConfig = useStoreState((x) => x.uiEditor.cameFromUIConfig);
  const setCameFromUIConfig = useStoreActions(
    (x) => x.uiEditor.setCameFromUIConfig
  );
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);

  const {
    name: sectionName,
    parentId,
    paramInfoId,
  } = useGetSectionInfo(sectionId);

  const currUIType = useGetSectionType(sectionId);
  const currTypeId = currUIType.id;

  const [setUITypeId, setUITypeConfig] = useSetUIType({
    sectionId: parentId,
    paramInfoId,
    defaultName: sectionName,
    childId: sectionId,
    currUIType,
    settingSectionConfig: true,
  });

  const onGoBackClick = () => {
    setActiveSection(parentId);
    setCameFromUIConfig(false);
    setTabIndex(1);
  };

  const onSectionTypeChange = (e) => {
    if (e && e !== currTypeId) {
      setUITypeId(e);
    }
  };

  const onConfigChange = (newValueFn) => {
    setUITypeConfig({ configName: "collections", newValueFn });
  };

  return (
    <>
      {cameFromUIConfig && <Button onClick={onGoBackClick}>Go back</Button>}
      <SectionConfigCore
        onSectionTypeChange={onSectionTypeChange}
        currTypeId={currTypeId}
        sectionId={sectionId}
        savedConfig={currUIType.config}
        onConfigChange={onConfigChange}
      />
    </>
  );
}

function SectionConfigCore({
  onSectionTypeChange,
  currTypeId,
  sectionId,
  savedConfig,
  onConfigChange,
}) {
  return (
    <>
      <Heading as="h3" size="xs" textTransform="uppercase" color="gray.400">
        Card Types
      </Heading>
      <ComboboxPlaceholder />
      <Heading as="h3" size="xs" textTransform="uppercase" color="gray.400">
        Contents
      </Heading>
      <Box
        py="0.5rem"
        px="0.75rem"
        borderRadius="2xl"
        bg="white"
        boxShadow="inner"
        border="1px"
        borderColor="white"
        flexGrow="1"
        mb="2.5rem"
        display="flex"
        flexDirection="column"
      >
        <SectionConfigTypeSelection
          onDropdownSelect={onSectionTypeChange}
          selectedId={currTypeId}
          sectionId={sectionId}
        />
        <SectionConfigComp
          savedConfig={savedConfig}
          onChange={onConfigChange}
        />
      </Box>
    </>
  );
}

function ComboboxPlaceholder() {
  return (
    <Flex
      direction="column"
      align="stretch"
      overflow="visible"
      h="2.5rem"
      w="100%"
      backgroundColor="white"
      borderRadius="full"
      mb="1rem"
      boxShadow="sm"
    >
      <InputGroup
        // width="100%"
        className="nodrag"
      >
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <InputRightElement>
          <IconButton
            aria-label={"toggle menu"}
            borderRadius="full"
            bg="white"
            icon={<ChevronDownIcon />}
          />
        </InputRightElement>
      </InputGroup>

      <Flex
        direction="column"
        w="100%"
        alignItems="stretch"
        transitionDuration="0.25s"
      ></Flex>
    </Flex>
  );
}
