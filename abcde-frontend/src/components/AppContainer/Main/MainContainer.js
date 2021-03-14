import { useState, useCallback } from "react";
import { Grid, GridItem, Box } from "@chakra-ui/react";
import Overview from "./SidePanes/Overview/Overview";
import SubNav from "./SubNav/SubNav";
import UIPage from "../../UI/UiPage";
import UiEditor from "./SidePanes/UiEditor/UiEditor";
import CustomGrid from "./CustomMapInteraction/CustomGrid";
import CustomMapInteractionCSS from "./CustomMapInteraction/CustomMapInteractionCSS";
import { useDropzone } from "react-dropzone";
import { useStoreActions } from "easy-peasy";

export default function MainContainer() {
  const [contentSize, setContentSize] = useState(0);
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
    <Grid
      h="100%"
      w="100vw"
      border="1px"
      overflow="hidden"
      templateRows="min-content 1fr"
      templateColumns="1fr"
      {...getRootProps()}
      borderColor="gray.200"
    >
      <SubNav />

      <Overview />

      <UiEditor />

      <GridItem
        colStart="1"
        colEnd="2"
        rowStart="2"
        rowEnd="3"
        minH="0"
        minW="0"
        h="100%"
      >
        <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
          <CustomMapInteractionCSS
            // showControls={true}
            maxScale={2}
            minScale={0.33}
            scaleBase={1.5}
            marginRatios={{ x: 1, y: 1 }}
            contentSize={contentSize}
          >
            <Box padding="2.5rem" h="100%">
              <CustomGrid gap={2} onSize={setContentSize}>
                <UIPage />
              </CustomGrid>
            </Box>
          </CustomMapInteractionCSS>
        </Box>
      </GridItem>
    </Grid>
  );
}
