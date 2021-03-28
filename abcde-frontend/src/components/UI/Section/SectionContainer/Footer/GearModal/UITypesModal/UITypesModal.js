import { useContext, useState } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box, HStack, Stack, Select, Input, Text } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";
import { getParameters } from "../../../../../../../utils/utils";
import { useStoreState, useStoreActions } from "easy-peasy";
import { getParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/getParamUI";
import _ from "lodash";

export default function UITypesModal() {
  const { isOpen, onClose, sectionId } = useContext(MenuContext);

  const moduleName = useStoreState(
    (state) => state.currentlySelected.currentlySelected[sectionId]?.moduleName
  );

  const objName = useStoreState(
    (state) => state.currentlySelected.currentlySelected[sectionId]?.objName
  );

  const globalCurr = useStoreState(
    (state) => state.globalCurr.globalCurr[sectionId]?.[moduleName]?.[objName]
  );

  const thisSectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );

  const getParametersAndKwargs = () => {
    const parameters = getParameters(thisSectionInfo, moduleName, objName).map(
      (x) => x.name
    );
    if (globalCurr) {
      const maybeAlsoKwargs = Object.keys(globalCurr);
      return _.union(parameters, maybeAlsoKwargs);
    }
    return parameters;
  };

  const parameters = getParametersAndKwargs();

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
          paramName={e}
          key={`${e}-${idx}`}
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
  const uiType = useStoreState(
    (state) =>
      state.uiTypes.uiTypes[sectionId]?.[moduleName]?.[objName]?.[paramName]
  );

  const uiTypeConfig = useStoreState(
    (state) =>
      state.uiTypeConfigs.uiTypeConfigs[sectionId]?.[moduleName]?.[objName]?.[
        paramName
      ]?.[uiType]
  );

  const setUiTypes = useStoreActions((actions) => actions.uiTypes.setUiTypes);
  const setUiTypeConfigs = useStoreActions(
    (actions) => actions.uiTypeConfigs.setUiTypeConfigs
  );

  const onSelect = (e) => {
    setUiTypes({
      sectionId,
      moduleName,
      objName,
      paramName,
      uiType: e.target.value,
    });
  };

  const onChange = (uiConfigOption, uiConfigValue) => {
    setUiTypeConfigs({
      sectionId,
      moduleName,
      objName,
      paramName,
      uiType,
      uiConfigOption,
      uiConfigValue,
    });
  };

  return (
    <HStack>
      <Box>{paramName}</Box>
      <Select
        placeholder="Select UI Type"
        onChange={onSelect}
        defaultValue={uiType}
      >
        {menuItems.map((e, idx) => (
          <option value={e} key={`${e}-${idx}`}>
            {e}
          </option>
        ))}
      </Select>
      {getParamUIConfig(uiType, { onChange, savedConfig: uiTypeConfig })}
    </HStack>
  );
}
