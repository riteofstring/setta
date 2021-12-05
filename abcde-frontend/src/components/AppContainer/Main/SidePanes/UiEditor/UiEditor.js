import {
  AddIcon,
  SmallCloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import {
  Heading,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  IconButton,
  HStack,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import { rangeArray, mod } from "../../../../../utils/utils";
import PaneContainer from "../PaneContainer";
import TextEditor from "./TextEditor/TextEditor";

const paneProps = {
  right: true,
  paneName: "uiEditor",
};

export default function UiEditor() {
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );

  const deleteEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.deleteEnteredText
  );

  const [numTabs, setNumTabs] = useState(1);
  const [currTabIdx, setCurrTabIdx] = useState(0);
  const tabNumArray = rangeArray(0, numTabs);

  const onDrop = useCallback(
    (acceptedFiles) => {
      acceptedFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Do whatever you want with the file contents
          const text = reader.result;
          const newIdx = numTabs + idx;
          setEnteredText({ idx: newIdx, text });
        };
        reader.readAsText(file);
      });
      setNumTabs(numTabs + acceptedFiles.length);
      setCurrTabIdx(numTabs);
    },
    [numTabs]
  );
  const { getRootProps } = useDropzone({ onDrop });

  function onAddClick() {
    setNumTabs(numTabs + 1);
    setCurrTabIdx(numTabs);
  }

  function onRemoveClick(idx) {
    deleteEnteredText(idx);
    setNumTabs(numTabs - 1);
    if (idx <= currTabIdx) {
      setCurrTabIdx(Math.max(0, currTabIdx - 1));
    }
  }

  function onGoToNext() {
    setCurrTabIdx(mod(currTabIdx + 1, numTabs));
  }
  function onGoToPrev() {
    setCurrTabIdx(mod(currTabIdx - 1, numTabs));
  }

  return (
    <PaneContainer paneProps={paneProps} dropZoneProps={getRootProps()}>
      <Tabs h="inherit" display="flex" flexDir="column">
        <TabList>
          <Tab>UI Config</Tab>
          <Tab>Parameter Settings</Tab>
          <Tab>Save</Tab>
          <Tab>Load</Tab>
          <Tab>Edit YAML</Tab>
        </TabList>
        <TabPanels flexGrow="1" display="grid" place-items="center">
          <TabPanel bg="white">UI Config</TabPanel>
          <TabPanel>Parameter Settings</TabPanel>
          <TabPanel>Save</TabPanel>
          <TabPanel>Load</TabPanel>
          <TabPanel display="grid" place-items="center" h="inherit">
            <Tabs
              variant="unstyled"
              maxH="100%"
              h="inherit"
              id="lkjlkj"
              display="flex"
              flexDir="column"
              index={currTabIdx}
              onChange={(index) => setCurrTabIdx(index)}
            >
              <Heading as="h1" size="md" color="gray.500" align="stretch">
                Edit YAML
              </Heading>
              <UiEditorPages tabNumArray={tabNumArray} />
              <TabsContainer
                tabNumArray={tabNumArray}
                currTabIdx={currTabIdx}
                onAddClick={onAddClick}
                onRemoveClick={onRemoveClick}
                onGoToNext={onGoToNext}
                onGoToPrev={onGoToPrev}
              />
            </Tabs>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </PaneContainer>
  );
}

function TabsContainer({
  tabNumArray,
  currTabIdx,
  onAddClick,
  onRemoveClick,
  onGoToNext,
  onGoToPrev,
}) {
  const [tabHover, setTabHover] = useState({});

  function onTabMouseOver(idx) {
    setTabHover({ ...tabHover, [idx]: true });
  }

  function onTabMouseLeave(idx) {
    setTabHover({ ...tabHover, [idx]: false });
  }

  function closeIconCondition(idx) {
    return idx === currTabIdx || tabHover[idx];
  }

  function onRemoveClickWrapper(idx) {
    onRemoveClick(idx);
    delete tabHover[idx];
  }

  return (
    <TabList
      display="flex"
      alignItems="center"
      overflow="hidden"
      maxWidth="inherit"
    >
      {tabNumArray.map((e) => (
        <HStack spacing="1px" key={`uitab-${e}`}>
          <Tab
            sx={{
              borderBottomRadius: "0.5rem",
              borderLeft: "1px",
              borderRight: "1px",
              borderBottom: "1px",
              borderColor: "gray.200",
              padding: "0.33rem 1rem",
              marginRight: "0.125rem",
            }}
            _selected={{ color: "white", bg: "gray.400" }}
            _hover={{ color: "white", bg: "gray.600" }}
            _active={{ color: "white", bg: "gray.700" }}
          >
            {e}
            <IconButton
              icon={closeIconCondition(e) && <SmallCloseIcon />}
              borderRadius="full"
              variant="ghost"
              size="xs"
              ml="0.75rem"
              marginright="0.125rem"
              onClick={() => onRemoveClickWrapper(e)}
              onMouseOver={() => onTabMouseOver(e)}
              onMouseLeave={() => onTabMouseLeave(e)}
            />
          </Tab>
        </HStack>
      ))}

      <IconButton
        icon={<AddIcon />}
        borderRadius="full"
        variant="ghost"
        size="xs"
        marginright="0.125rem"
        onClick={onAddClick}
      />
      <HStack w="100%" justifyContent="flex-end">
        <IconButton
          icon={<ChevronLeftIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
          onClick={onGoToPrev}
        />
        <IconButton
          icon={<ChevronRightIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
          onClick={onGoToNext}
        />
      </HStack>
    </TabList>
  );
}

function UiEditorPages({ tabNumArray }) {
  return (
    <TabPanels
      flexGrow="1"
      sx={{
        gridTemplateRows: "1fr",
        gridTemplateColumns: "1fr",
        overflowY: "auto",
      }}
    >
      {tabNumArray.map((e) => (
        <TabPanel
          p="0"
          m="0"
          // maxH="inherit"
          // width="100%"
          // h="100%"
          sx={{
            gridRow: "span 1",
            gridColumn: "span 1",
            overflowY: "hidden",
          }}
          key={`uitabpanel-${e}`}
        >
          <TextEditor idx={e} />
        </TabPanel>
      ))}
    </TabPanels>
  );
}
