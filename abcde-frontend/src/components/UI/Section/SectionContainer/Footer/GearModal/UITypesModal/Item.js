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

import { UIType, UITYPES } from "../../../../../../../classes/uiType";
import ReduceMotionAccordian from "../../../../../../../utils/ReduceMotionAccordian";
import { useGetUITypeConfig } from "../../../../../../../utils/useCreateInfo";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

export default function Item({ paramInfo, getUITypeFn }) {
  const uiType = getUITypeFn(paramInfo);
  const uiTypeConfig = useGetUITypeConfig(uiType.id);
  const paramName = paramInfo.name;

  const setOneUIType = useStoreActions((x) => x.uiTypes.setOneUIType);
  const setOneConfig = useStoreActions((x) => x.uiTypeConfigs.setOneConfig);

  const onSelect = (e) => {
    const id = uiType.id;
    setOneUIType({
      uiTypeId: id,
      uiType: new UIType({ id, name: e.target.value }),
    });
  };

  const onChange = (configName, value) => {
    console.log("onChange", configName, value);
    const id = uiTypeConfig.id;
    setOneConfig({
      configId: id,
      configName,
      value,
    });
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
                  defaultValue={uiType.name}
                >
                  {UITYPES.map((e, idx) => (
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
