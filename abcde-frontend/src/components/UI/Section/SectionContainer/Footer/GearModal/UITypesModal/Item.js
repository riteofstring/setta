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
import { useStoreState, useStoreActions } from "easy-peasy";
import { ParamUIConfig } from "../../../Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { UITYPES } from "../../../../../../../classes/uiType";

export default function Item({ sectionId, paramName }) {
  const uiType = useStoreState((state) =>
    state.master.sections.getParamUIType(sectionId, paramName)
  );

  const savedConfig = useStoreState((state) =>
    state.master.sections.getParamUITypeConfig(sectionId, paramName)
  );

  const setParamUIType = useStoreActions(
    (actions) => actions.master.setParamUIType
  );
  const setParamUITypeConfig = useStoreActions(
    (actions) => actions.master.setParamUITypeConfig
  );

  const onSelect = (e) => {
    setParamUIType({
      sectionId,
      paramName,
      uiName: e.target.value,
    });
  };

  const onChange = (configName, value) => {
    setParamUITypeConfig({
      sectionId,
      paramName,
      configName,
      value,
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
                savedConfig={savedConfig}
                onChange={onChange}
              />
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </VStack>
  );
}
