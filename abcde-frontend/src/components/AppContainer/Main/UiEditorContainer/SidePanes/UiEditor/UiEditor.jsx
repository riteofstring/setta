import {
  Button,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useMultiStyleConfig,
  useTab,
} from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreActions, useStoreState } from "easy-peasy";
import React from "react";
import { UI_EDITOR } from "utils/constants";
import SectionConfig from "./SectionConfig/SectionConfig";
import UIConfig from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export default function UiEditor() {
  const vis = useStoreState((x) => x.panes.vis[paneProps.paneName]);
  const tabIndex = useStoreState((x) => x.uiEditor.tabIndex);
  const setTabIndex = useStoreActions((x) => x.uiEditor.setTabIndex);

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
        visibility={vis ? "visible" : "hidden"}
      >
        <TabList borderBottom="none" pb="1.5rem">
          <CustomTab name="Card" />
          <CustomTab name="Parameters" />
        </TabList>
        <TabPanels
          flexGrow="1"
          display="grid"
          place-items="center"
          id="tabPanelOne"
          h="inherit"
          overflowY="auto"
        >
          <TabPanel p="3px">
            <SectionConfig />
          </TabPanel>
          <TabPanel p="3px">
            <UIConfig />
          </TabPanel>
        </TabPanels>
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
      data-testid={`UiEditor ${tabProps.name} Button`}
    >
      {tabProps.name}
    </Button>
  );
});
