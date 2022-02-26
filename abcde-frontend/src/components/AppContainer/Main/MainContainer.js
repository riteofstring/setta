import { Box } from "@chakra-ui/react";
import { useState } from "react";

import UIPage from "../../UI/UiPage";
import GridWrapper from "../GridWrapper/GridWrapper";
import Overview from "./UiEditorContainer/SidePanes/Overview/Overview";
import UiEditor from "./UiEditorContainer/SidePanes/UiEditor/UiEditor";
import ReactFlow from "react-flow-renderer"

const elements = [
  { id: '1', data: { label: 'Node 1' }, position: { x: 250, y: 5 } },
  // you can also pass a React component as a label
  { id: '2', data: { label: <div>Node 2</div> }, position: { x: 100, y: 100 } },
  { id: 'e1-2', source: '1', target: '2', animated: true },
];

export default function MainContainer() {
  return (
    <>
      <Overview />
      <UiEditor />
      <GridWrapper>
        <Box h="inherit" overflow="hidden" flex="1" minH="0" minW="0">
          <Box padding="2.5rem" h="100%">
            <ReactFlow elements={elements} />
            {/* <UIPage /> */}
          </Box>
        </Box>
      </GridWrapper>
    </>
  );
}
