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

import { useUITypeConfig } from "../../../../../../../hooks/useCreateInfo";
import ReduceMotionAccordian from "../../../../../../../utils/ReduceMotionAccordian";
import {
  prettyToUITypes,
  uiTypesToPretty,
} from "../../../../../../../utils/constants";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

export default function Item({ paramInfo, getUITypeFn, setNameFn }) {
  const uiType = getUITypeFn(paramInfo);
  const [uiTypeConfig, setUITypeConfig] = useUITypeConfig(uiType);
  const paramName = paramInfo.name;

  console.log("Item", uiTypeConfig, uiType.name);

  const onSelect = (e) => {
    setNameFn(paramInfo, {
      uiTypeId: uiType.id,
      name: prettyToUITypes.get(e.target.value),
    });
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
