import * as Tabs from "@radix-ui/react-tabs";

import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { usePanes } from "models/panes";
import { useUIEditor } from "models/uiEditor";
import { UI_EDITOR } from "utils/constants";
import SectionConfig from "./SectionConfig/SectionConfig";
import UIConfig from "./UIConfig/UIConfig";

const paneProps = {
  right: true,
  paneName: UI_EDITOR,
};

export default function UiEditor() {
  const vis = usePanes((x) => x.vis[paneProps.paneName]);
  const tabIndex = useUIEditor((x) => x.tabIndex);
  const setTabIndex = useUIEditor((x) => x.setTabIndex);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Edit">
      <Tabs.Root defaultValue="tab1">
        <Tabs.List className="flex gap-4">
          <TabItem name="Card" value="tab1" />
          <TabItem name="Parameters" value="tab2" />
        </Tabs.List>
        <TabContent value="tab1">
          <SectionConfig />
        </TabContent>
        <TabContent value="tab2">
          <UIConfig />
        </TabContent>
      </Tabs.Root>
      {/* <Tabs
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
          <TabPanel p="3px" display="flex" flexDirection="column">
            
          </TabPanel>
          <TabPanel p="3px">
            
          </TabPanel>
        </TabPanels>
      </Tabs> */}
    </PaneContainer>
  );
}

// <Button
//   __css={styles.tab}
//   {...tabProps}
//   px="0"
//   borderBottom={isSelected ? "gray.500" : "none"}
//   borderLeft="none"
//   borderRight="none"
//   borderTop="none"
//   borderWidth="3px"
//   py="0.5rem"
//   mr="1rem"
//   fontSize="xl"
//   fontWeight={isSelected ? "800" : "300"}
//   color={isSelected ? "gray.800" : "gray.500"}
//   data-testid={`UiEditor ${tabProps.name} Button`}
// >
//   {tabProps.name}
// </Button>

function TabItem({ name }) {
  return <Tabs.Trigger>{name}</Tabs.Trigger>;
}

function TabContent(props) {
  const { children, value } = props;
  return (
    <Tabs.Content
      className="flex-grow grid  h-[inherit] overflow-y-auto"
      value={value}
    >
      {children}
    </Tabs.Content>
  );
}

// const CustomTab = React.forwardRef((props, ref) => {
//   // 1. Reuse the `useTab` hook
//   const tabProps = useTab({ ...props, ref });
//   const isSelected = !!tabProps["aria-selected"];

//   // 2. Hook into the Tabs `size`, `variant`, props
//   const styles = useMultiStyleConfig("Tabs", tabProps);

//   return (

//   );
// });
