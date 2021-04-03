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

  // temp_
  const tempTabs = [1, 2, 3, 4, 5];
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
            sx={{
              gridRow: "span 1",
              gridColumn: "span 1",
              overflowY: "hidden",
            }}
          >
            <TextEditor />
          </TabPanel>
          <TabPanel>
            <p>two!</p>
          </TabPanel>
        </TabPanels>
        <TabList>
          {tempTabs.map((e, idx) => (
            <Tab
              sx={{
                borderBottomRadius: "1em",
                bg: "gray.300",
              }}
              _selected={{ color: "white", bg: "gray.500" }}
              _hover={{ color: "white", bg: "gray.600" }}
              _active={{ color: "white", bg: "gray.700" }}
              key={`uitab-${idx}`}
            >
              {e}
            </Tab>
          ))}
        </TabList>
      </Tabs>
    </PaneContainer>
  );
}
