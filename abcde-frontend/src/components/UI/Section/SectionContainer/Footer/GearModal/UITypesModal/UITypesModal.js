import { Box, Text, VStack } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

import ModalContainer from "../../../../../../../utils/ModalContainer/ModalContainer";
import { arraysAreEqual } from "../../../../../../../utils/commonFunctions";
import Item from "./Item";

export default function UITypesModal({ isOpen, onClose, sectionId }) {
  const paramNames = useStoreState(
    (state) =>
      Object.keys(state.master.sections.getParametersAndKwargs(sectionId)),
    arraysAreEqual
  );

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"2xl"}
      maxH="80vh"
      header={<Header />}
      body={<Body sectionId={sectionId} paramNames={paramNames} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body({ sectionId, paramNames }) {
  return paramNames.length > 0 ? (
    <VStack align="stretch" spacing="0">
      {paramNames.map((e, idx) => (
        <Item sectionId={sectionId} paramName={e} key={`${e}-${idx}`} />
      ))}
    </VStack>
  ) : (
    <Text>There are no parameters</Text>
  );
}

function Footer() {
  return <Box></Box>;
}
