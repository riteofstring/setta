import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useState } from "react";
import Measure from "react-measure";
import { UI_EDITOR } from "utils/constants";

import SectionConfig from "./SectionConfig";
import UIConfig from "./UIConfig";
import YamlEditor from "./YamlEditor";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export default function UiEditor() {
  const tabIndex = useStoreState((x) => x.uiEditor.tabIndex);
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);
  const [dimensions, setDimensions] = useState({});

  return (
    <PaneContainer paneProps={paneProps}>
      <Tabs
        h="inherit"
        display="flex"
        flexDir="column"
        className="topTab"
        isLazy
        index={tabIndex}
        onChange={setTabIndex}
      >
        <TabList>
          <Tab>Section Config</Tab>
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
              <TabPanel>
                <SectionConfig />
              </TabPanel>
              <TabPanel>
                <UIConfig />
              </TabPanel>
              <TabPanel>Parameter Sweeps</TabPanel>
              <TabPanel display="grid" place-items="center">
                <YamlEditor dimensions={dimensions} />
              </TabPanel>
            </TabPanels>
          )}
        </Measure>
      </Tabs>
    </PaneContainer>
  );
}
