import {
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
} from "@chakra-ui/react";

import ReduceMotionAccordian from "../../../../../../utils/ReduceMotionAccordian";

export default function PageAccordion(props) {
  return (
    <ReduceMotionAccordian defaultIndex={[0]} allowMultiple>
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              {`Group ${props.pageNum}`}
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>{props.children}</AccordionPanel>
      </AccordionItem>
    </ReduceMotionAccordian>
  );
}
