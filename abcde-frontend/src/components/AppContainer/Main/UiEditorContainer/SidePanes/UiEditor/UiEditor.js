import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreActions } from "easy-peasy";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Measure from "react-measure";
import { rangeArray, mod } from "utils/utils";

import TabsContainer from "./TabsContainer";
import UIConfig from "./UIConfig";
import UiEditorPages from "./UiEditorPages";

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

  const [dimensions, setDimensions] = useState({});

  return (
    <PaneContainer paneProps={paneProps} dropZoneProps={getRootProps()}>
      <Tabs h="inherit" display="flex" flexDir="column" className="topTab">
        <TabList>
          <Tab>UI Config</Tab>
          <Tab>Parameter Sweeps</Tab>
          <Tab>Edit YAML</Tab>
        </TabList>
        <Measure
          client
          onResize={(contentRect) => setDimensions(contentRect.client)}
        >
          {({ measureRef }) => (
            <TabPanels
              flexGrow="1"
              display="grid"
              place-items="center"
              id="tabPanelOne"
              h="inherit"
              overflowY="auto"
              ref={measureRef}
            >
              <TabPanel bg="white">
                <UIConfig />
              </TabPanel>
              <TabPanel>Parameter Sweeps</TabPanel>
              <TabPanel display="grid" place-items="center">
                <Tabs
                  variant="unstyled"
                  className="lkjlkj"
                  display="flex"
                  flexDir="column"
                  index={currTabIdx}
                  onChange={(index) => setCurrTabIdx(index)}
                >
                  <UiEditorPages
                    tabNumArray={tabNumArray}
                    dimensions={dimensions}
                  />
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
          )}
        </Measure>
      </Tabs>
    </PaneContainer>
  );
}
