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
import { useGetUIType } from "../../../../../../../utils/useCreateInfo";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";

export default function Item({ paramInfo }) {
  const uiType = useGetUIType(paramInfo.id);
  const paramName = paramInfo.name;

  const setOneUIType = useStoreActions((x) => x.uiTypes.setOneUIType);

  console.log("Item", paramName, uiType);

  // const savedConfig = useStoreState((state) =>
  //   state.master.sections.getParamUITypeConfig(sectionId, paramName)
  // );

  // const setParamUIType = useStoreActions(
  //   (actions) => actions.master.setParamUIType
  // );
  // const setParamUITypeConfig = useStoreActions(
  //   (actions) => actions.master.setParamUITypeConfig
  // );

  const onSelect = (e) => {
    const id = uiType.id;
    setOneUIType({
      uiTypeId: id,
      uiType: new UIType({ id, name: e.target.value, specs: uiType.specs }),
    });
  };

  // const onChange = (configName, value) => {
  //   setParamUITypeConfig({
  //     sectionId,
  //     paramName,
  //     configName,
  //     value,
  //   });
  // };

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
                // savedConfig={savedConfig}
                // onChange={onChange}
              />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </ReduceMotionAccordian>
    </VStack>
  );
}
