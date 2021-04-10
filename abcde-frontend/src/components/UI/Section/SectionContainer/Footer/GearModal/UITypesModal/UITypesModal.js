import { useContext } from "react";
import { MenuContext } from "../../SectionFooter";
import { Box, HStack, Stack, Select, Text } from "@chakra-ui/react";
import ModalContainer from "../../../../../../../utils/ModalContainer";
import { parameterStateDetailsGetter } from "../../../../../../../utils/utils";
import { useStoreState, useStoreActions } from "easy-peasy";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

export default function UITypesModal() {
  const { isOpen, onClose, sectionId } = useContext(MenuContext);

  const parameters = useStoreState((state) =>
    state.master.sections.getParameters(sectionId)
  );

  console.log("UITypesModal", parameters);

  return (
    <ModalContainer
      onClose={onClose}
      isOpen={isOpen}
      size={"6xl"}
      header={<Header />}
      body={<Body sectionId={sectionId} parameters={parameters} />}
      footer={<Footer />}
    />
  );
}

function Header() {
  return <Box>UI Types</Box>;
}

function Body({ sectionId, parameters }) {
  const paramNames = Object.keys(parameters);
  return paramNames.length > 0 ? (
    <Stack spacing={2}>
      {paramNames.map((e, idx) => (
        <Item
          sectionId={sectionId}
          parameter={parameters[e]}
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

function Item({ sectionId, parameter }) {
  console.log("Item", sectionId, parameter, parameter.uiType);

  const uiTypeConfig = null;
  const onChange = null;

  // const uiTypeConfig = useStoreState(
  //   (state) =>
  //     parameterStateDetailsGetter(
  //       state.uiTypeConfigs.uiTypeConfigs,
  //       sectionId,
  //       moduleName,
  //       objName,
  //       paramName
  //     )?.[uiType]
  // );

  const setParamUIType = useStoreActions(
    (actions) => actions.master.setParamUIType
  );
  // const setUiTypeConfigs = useStoreActions(
  //   (actions) => actions.uiTypeConfigs.setUiTypeConfigs
  // );

  const onSelect = (e) => {
    setParamUIType({
      sectionId,
      paramName: parameter.name,
      uiName: e.target.value,
    });
  };

  // const onChange = (uiConfigOption, uiConfigValue) => {
  //   setUiTypeConfigs({
  //     sectionId,
  //     moduleName,
  //     objName,
  //     paramName,
  //     uiType,
  //     uiConfigOption,
  //     uiConfigValue,
  //   });
  // };

  return (
    <HStack>
      <Box>{parameter.name}</Box>
      <Select
        placeholder="Select UI Type"
        onChange={onSelect}
        defaultValue={parameter.uiType}
      >
        {menuItems.map((e, idx) => (
          <option value={e} key={`${e}-${idx}`}>
            {e}
          </option>
        ))}
      </Select>
      <ParamUIConfig
        uiType={parameter.uiType}
        childProps={{ onChange, savedConfig: uiTypeConfig }}
      />
    </HStack>
  );
}
