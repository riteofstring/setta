import {
  Box,
  VStack,
  Heading,
  Select,
  FormControl,
  FormLabel,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  AccordionIcon,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import ReduceMotionAccordian from "utils/ReduceMotionAccordian";
import { prettyToUITypes, uiTypesToPretty } from "utils/constants";

import { useSetUITypeConfig } from "hooks/useCreateInfo";
import { ParamUIConfig } from "components/AppContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

export default function Item({ paramInfo, getUITypeFn }) {
  const uiType = getUITypeFn(paramInfo);
  const uiTypeConfig = uiType.config;
  const setUITypeConfig = useSetUITypeConfig(uiType);
  const paramName = paramInfo.name;

  console.log("Item", uiTypeConfig, uiType.name);

  const setName = useStoreActions((x) => x.uiTypes.setName);

  const onSelect = (e) => {
    setName({ uiTypeId: uiType.id, name: prettyToUITypes.get(e.target.value) });
  };

  const onChange = (configName, value) => {
    console.log("onChange", configName, value);
    setUITypeConfig({ configName, value });
  };

  return (
    <VStack align="stretch">
      <ReduceMotionAccordian defaultIndex={[0]} allowMultiple>
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
                  defaultValue={uiTypesToPretty.get(uiType.name)}
                >
                  {[...prettyToUITypes.keys()].map((e, idx) => (
                    <option value={e} key={`${e}-${idx}`}>
                      {e}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <ParamUIConfig
                name={uiType.name}
                savedConfig={uiTypeConfig}
                onChange={onChange}
              />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </ReduceMotionAccordian>
    </VStack>
  );
}
