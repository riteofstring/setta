import React from "react";
import {
  VStack,
  HStack,
  Box,
  Accordion,
  AccordionItem,
  AccordionIcon,
  AccordionButton,
  AccordionPanel,
  Input,
} from "@chakra-ui/react";

const ParamSweep = () => {
  return (
    <VStack width="100%" mt="2.5rem">
      <Accordion allowMultiple width="100%">
        <AccordionItem>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              Parameter Sweep
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel>
            <HStack mt="1rem">
              <Input placeholder="from" size="sm" width="4rem" />
              <Input placeholder="to" size="sm" width="4rem" />
              <Input placeholder="step" size="sm" width="4rem" />
            </HStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </VStack>
  );
};

export default ParamSweep;
