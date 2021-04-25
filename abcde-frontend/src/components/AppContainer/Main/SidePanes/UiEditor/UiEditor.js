import { useCallback, useState } from "react";
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
import { AddIcon, ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import TextEditor from "./TextEditor/TextEditor";
import PaneContainer from "../PaneContainer";
import { useDropzone } from "react-dropzone";
import { useStoreActions } from "easy-peasy";
import { rangeArray, mod } from "../../../../../utils/utils";

const paneProps = {
  right: true,
  paneName: "uiEditor",
};

export default function UiEditor() {
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );

  const [numTabs, setNumTabs] = useState(1);
  const [currTabIdx, setCurrTabIdx] = useState(0);
  const tabNumArray = rangeArray(0, numTabs);

  const onDrop = useCallback((acceptedFiles) => {
    for (let file of acceptedFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        // Do whatever you want with the file contents
        const text = reader.result;
        setEnteredText(text);
      };
      reader.readAsText(file);
    }
  }, []);
  const { getRootProps } = useDropzone({ onDrop });

  function onAddClick() {
    setNumTabs(numTabs + 1);
    setCurrTabIdx(numTabs);
  }

  function onGoToNext() {
    setCurrTabIdx(mod(currTabIdx + 1, numTabs));
  }
  function onGoToPrev() {
    setCurrTabIdx(mod(currTabIdx - 1, numTabs));
  }

  return (
    <PaneContainer paneProps={paneProps} dropZoneProps={getRootProps()}>
      <Tabs
        variant="unstyled"
        maxH="inherit"
        h="inherit"
        display="flex"
        sx={{ flexDirection: "column" }}
        id="lkjlkj"
        index={currTabIdx}
        onChange={(index) => setCurrTabIdx(index)}
      >
        <Heading as="h1" size="md" color="gray.500" align="stretch">
          Edit YAML
        </Heading>
        <UiEditorPages tabNumArray={tabNumArray} />
        <TabsContainer
          tabNumArray={tabNumArray}
          onAddClick={onAddClick}
          onGoToNext={onGoToNext}
          onGoToPrev={onGoToPrev}
        />
      </Tabs>
    </PaneContainer>
  );
}

function TabsContainer({ tabNumArray, onAddClick, onGoToNext, onGoToPrev }) {
  return (
    <TabList display="flex" alignItems="center">
      {tabNumArray.map((e) => (
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
          key={`uitab-${e}`}
        >
          {e}
        </Tab>
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
      maxH="inherit"
      display="grid"
      w="100%"
      maxH="100%"
      h="100%"
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
          maxH="inherit"
          width="100%"
          h="100%"
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
