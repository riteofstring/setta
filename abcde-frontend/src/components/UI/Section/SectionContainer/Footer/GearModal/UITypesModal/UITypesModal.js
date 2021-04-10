import { useContext } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box, VStack, Text } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";
import { getParameters } from "../../../../../../../utils/utils";
import { useStoreState } from "easy-peasy";
import Item from "./Item";

export default function UITypesModal() {
  const { isOpen, onClose, sectionId } = useContext(MenuContext);

  const moduleName = useStoreState(
    (state) => state.currentlySelected.currentlySelected[sectionId]?.moduleName
  );

  const objName = useStoreState(
    (state) => state.currentlySelected.currentlySelected[sectionId]?.objName
  );

  const savedKwargs = useStoreState(
    (state) => state.savedKwargs.savedKwargs[sectionId]?.[moduleName]?.[objName]
  );

  const thisSectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );

  const getParametersAndKwargs = () => {
    const parameters = getParameters(thisSectionInfo, moduleName, objName).map(
      (x) => x.name
    );
    if (savedKwargs) {
      const maybeAlsoKwargs = Object.keys(savedKwargs);
      return parameters.concat(maybeAlsoKwargs);
    }
    return parameters;
  };

  const parameters = getParametersAndKwargs();

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"2xl"}
      isCentered={false}
      maxH="80vh"
      header={<Header />}
      body={
        <Body
          sectionId={sectionId}
          moduleName={moduleName}
          objName={objName}
          parameters={parameters}
        />
      }
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body({ sectionId, moduleName, objName, parameters }) {
  return parameters.length > 0 ? (
    <VStack align="stretch" spacing="0">
      {parameters.map((e, idx) => (
        <Item
          sectionId={sectionId}
          moduleName={moduleName}
          objName={objName}
          paramName={e}
          key={`${e}-${idx}`}
        />
      ))}
    </VStack>
  ) : (
    <Text>There are no parameters</Text>
  );
}

function Footer() {
  return <Box></Box>;
}
