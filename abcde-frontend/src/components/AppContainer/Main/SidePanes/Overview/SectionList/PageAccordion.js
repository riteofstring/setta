import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
} from "@chakra-ui/react";

import { useState } from "react";

export default function PageAccordion(props) {
  const [reduceMotion, setReduceMotion] = useState(true);

  return (
    <Accordion
      defaultIndex={[0]}
      allowMultiple
      reduceMotion={reduceMotion}
      onMouseOver={() => setReduceMotion(false)}
    >
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              {`Page ${props.pageNum}`}
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>{props.children}</AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
