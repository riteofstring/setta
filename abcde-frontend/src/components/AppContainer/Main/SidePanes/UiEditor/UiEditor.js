import { useCallback } from "react";
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

const paneProps = {
  right: true,
  paneName: "uiEditor",
};

export default function UiEditor() {
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );

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

  return (
    <PaneContainer paneProps={paneProps} dropZoneProps={getRootProps()}>
      <Tabs
        variant="unstyled"
        maxH="inherit"
        h="inherit"
        display="flex"
        sx={{ flexDirection: "column" }}
        id="lkjlkj"
      >
        <Heading as="h1" size="md" color="gray.500" align="stretch">
          Edit YAML
        </Heading>
        <UiEditorPages />
        <TabsContainer />
      </Tabs>
    </PaneContainer>
  );
}

function TabsContainer() {
  // temp_
  const tempTabs = [1, 2, 3, 4, 5];
  return (
    <TabList display="flex" alignItems="center">
      {tempTabs.map((e, idx) => (
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
          key={`uitab-${idx}`}
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
      />
      <HStack w="100%" justifyContent="flex-end">
        <IconButton
          icon={<ChevronLeftIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
        />
        <IconButton
          icon={<ChevronRightIcon />}
          borderRadius="full"
          variant="ghost"
          size="xs"
          marginright="0.125rem"
        />
      </HStack>
    </TabList>
  );
}

function UiEditorPages() {
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
      >
        <TextEditor />
      </TabPanel>
    </TabPanels>
  );
}
