import { TabPanels, TabPanel } from "@chakra-ui/react";

import TextEditor from "../TextEditor/TextEditor";

export default function UiEditorPages({ tabNumArray, dimensions }) {
  return (
    <TabPanels
      flexGrow="1"
      display="flex"
      flexDir="column"
      className="tabPanelUIContainer"
      h="inherit"
      w="inherit"
      overflow="hidden"
    >
      {tabNumArray.map((e) => (
        <TabPanel
          p="0"
          m="0"
          flexGrow="1"
          display="grid"
          flexDir="column"
          className="tabPanelMapped"
          key={`uitabpanel-${e}`}
          alignSelf="flex-start"
          h="inherit"
          w="inherit"
          overflow="hidden"
        >
          <TextEditor idx={e} dimensions={dimensions} />
        </TabPanel>
      ))}
    </TabPanels>
  );
}
