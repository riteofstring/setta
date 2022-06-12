import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Button,
  Box,
  useMultiStyleConfig,
  useTab,
} from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useState, useRef } from "react";
import React from "react";
import Measure from "react-measure";
import { useIsOverflow } from "utils/Overflow/useIsOverflow";
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

  const ref = useRef();
  const isOverflow = useIsOverflow(ref);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit">
      <Tabs
        h="inherit"
        display="flex"
        flexDir="column"
        className="topTab"
        isLazy
        index={tabIndex}
        onChange={setTabIndex}
      >
        <TabList borderBottom="none" pb="1.5rem">
          <CustomTab>Card</CustomTab>
          <CustomTab>Parameters</CustomTab>
          <CustomTab>YAML</CustomTab>
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
              <TabPanel p="3px">
                <SectionConfig />
              </TabPanel>
              <TabPanel p="3px">
                <UIConfig />
              </TabPanel>
              <TabPanel display="grid" place-items="center" px="0">
                <YamlEditor dimensions={dimensions} />
              </TabPanel>
            </TabPanels>
          )}
        </Measure>
      </Tabs>
    </PaneContainer>
  );
}

const CustomTab = React.forwardRef((props, ref) => {
  // 1. Reuse the `useTab` hook
  const tabProps = useTab({ ...props, ref });
  const isSelected = !!tabProps["aria-selected"];

  // 2. Hook into the Tabs `size`, `variant`, props
  const styles = useMultiStyleConfig("Tabs", tabProps);

  return (
    <Button
      __css={styles.tab}
      {...tabProps}
      px="0"
      borderBottom={isSelected ? "gray.500" : "none"}
      borderLeft="none"
      borderRight="none"
      borderTop="none"
      borderWidth="3px"
      py="0.5rem"
      mr="1rem"
      fontSize="xl"
      fontWeight={isSelected ? "800" : "300"}
      color={isSelected ? "gray.800" : "gray.500"}
    >
      {tabProps.children}
    </Button>
  );
});
