import { useContext, useState } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box, HStack, Stack, Select, Input, Text } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";
import { getParameters } from "../../../../../../../utils/utils";
import { useStoreState, useStoreActions } from "easy-peasy";

export default function UITypesModal() {
  const { isOpen, onClose, sectionId } = useContext(MenuContext);

  const currentlySelected = useStoreState(
    (state) => state.currentlySelected.currentlySelected[sectionId]
  );

  const thisSectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );

  const tryGetParameters = () => {
    try {
      const { moduleName, objName } = currentlySelected;
      return {
        parameters: getParameters(thisSectionInfo, moduleName, objName),
        moduleName,
        objName,
      };
    } catch (err) {
      return { parameters: [], moduleName: null, objName: null };
    }
  };

  const { parameters, moduleName, objName } = tryGetParameters();

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"6xl"}
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
    <Stack spacing={2}>
      {parameters.map((e, idx) => (
        <Item
          sectionId={sectionId}
          moduleName={moduleName}
          objName={objName}
          paramName={e.name}
          key={`${e.name}-${idx}`}
        />
      ))}
    </Stack>
  ) : (
    <Text>There are no parameters</Text>
  );
}

function Footer() {
  return <Box>Bye</Box>;
}

const menuItems = [
  "TEXT",
  "SLIDER",
  "BOOLEAN",
  "INCREMENTER",
  "NESTED_OBJECT",
  "LIST_NESTED_OBJECT",
];

function Item({ sectionId, moduleName, objName, paramName }) {
  const setCurrUIType = useStoreActions(
    (actions) => actions.uiTypes.setCurrUIType
  );

  const onSelect = (e) => {
    setCurrUIType({
      sectionId,
      moduleName,
      objName,
      paramName,
      uiType: e.target.value,
    });
  };

  return (
    <HStack>
      <Box>{paramName}</Box>
      <Select placeholder="Select UI Type" onChange={onSelect}>
        {menuItems.map((e, idx) => (
          <option value={e} key={`${e}-${idx}`}>
            {e}
          </option>
        ))}
      </Select>
      <Input placeholder="Min" />
      <Input placeholder="Max" />
    </HStack>
  );
}
