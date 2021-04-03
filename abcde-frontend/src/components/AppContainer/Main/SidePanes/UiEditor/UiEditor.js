import { useCallback } from "react";
import {
  Heading,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Flex,
  Grid,
} from "@chakra-ui/react";
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
            sx={{ gridRow: "span 1", gridColumn: "span 1" }}
          >
            <TextEditor />
          </TabPanel>
          <TabPanel>
            <p>two!</p>
          </TabPanel>
        </TabPanels>
        <TabList>
          <Tab _selected={{ color: "white", bg: "blue.500" }}>Tab 1</Tab>
          <Tab _selected={{ color: "white", bg: "green.400" }}>Tab 2</Tab>
        </TabList>
      </Tabs>
    </PaneContainer>
  );
}
