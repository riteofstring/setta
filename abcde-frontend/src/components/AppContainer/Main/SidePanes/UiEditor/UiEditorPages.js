import { TabPanels, TabPanel } from "@chakra-ui/react";
import { useState } from "react";
import Measure from "react-measure";

import TextEditor from "./TextEditor/TextEditor";

export default function UiEditorPages({ tabNumArray }) {
  const [dimensions, setDimensions] = useState({});
  console.log("height", dimensions.height);

  return (
    <Measure
      client
      onResize={(contentRect) => null} //setDimensions(contentRect.client)}
    >
      {({ measureRef }) => (
        <TabPanels
          flexGrow="1"
          display="flex"
          flexDir="column"
          className="tabPanelUIContainer"
          h="inherit"
          w="inherit"
          overflow="hidden"
          ref={measureRef}
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
              bg="red"
            >
              <TextEditor idx={e} dimensions={dimensions} />
            </TabPanel>
          ))}
        </TabPanels>
      )}
    </Measure>
  );
}
