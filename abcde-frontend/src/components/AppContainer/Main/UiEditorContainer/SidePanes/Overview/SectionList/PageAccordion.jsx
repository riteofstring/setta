import { useState } from "react";

export default function PageAccordion(props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Collapsible.Root>
        <Collapsible.Trigger>
          {open ? "open" : "close"} <h2>{`Group ${props.pageNum}`}</h2>
        </Collapsible.Trigger>
        <Collapsible.Content>{props.children}</Collapsible.Content>
      </Collapsible.Root>

      {/* <ReduceMotionAccordian defaultIndex={[0]} allowMultiple>
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box flex="1" textAlign="left">
              {`Group ${props.pageNum}`}
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}></AccordionPanel>
      </AccordionItem>
    </ReduceMotionAccordian> */}
    </>
  );
}
