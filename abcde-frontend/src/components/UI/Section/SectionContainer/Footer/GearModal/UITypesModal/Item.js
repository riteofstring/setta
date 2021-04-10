import {
  Box,
  VStack,
  Heading,
  Select,
  FormControl,
  FormLabel,
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  AccordionIcon,
} from "@chakra-ui/react";
import { parameterStateDetailsGetter } from "../../../../../../../utils/utils";
import { useStoreState, useStoreActions } from "easy-peasy";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

const menuItems = [
  "TEXT",
  "SLIDER",
  "BOOLEAN",
  "INCREMENTER",
  "NESTED_OBJECT",
  "LIST_NESTED_OBJECT",
];

export default function Item({ sectionId, moduleName, objName, paramName }) {
  const uiType = useStoreState((state) =>
    parameterStateDetailsGetter(
      state.uiTypes.uiTypes,
      sectionId,
      moduleName,
      objName,
      paramName
    )
  );

  const uiTypeConfig = useStoreState(
    (state) =>
      parameterStateDetailsGetter(
        state.uiTypeConfigs.uiTypeConfigs,
        sectionId,
        moduleName,
        objName,
        paramName
      )?.[uiType]
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
    <VStack align="stretch">
      <Accordion defaultIndex={[0]} allowMultiple>
        <AccordionItem>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              <Heading as="h2" size="md">
                {paramName}
              </Heading>
            </Box>
            <AccordionIcon />
          </AccordionButton>

          <AccordionPanel pb={4}>
            <VStack align="stretch">
              <FormControl id="placeholder">
                <FormLabel>placeholder</FormLabel>
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
              </FormControl>
              <ParamUIConfig
                uiType={uiType}
                childProps={{ onChange, savedConfig: uiTypeConfig }}
              />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </VStack>
  );
}
