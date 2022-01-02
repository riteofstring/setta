import { Accordion } from "@chakra-ui/react";
import { useState } from "react";

export default function ReduceMotionAccordian(props) {
  const [reduceMotion, setReduceMotion] = useState(true);

  return (
    <Accordion
      {...props}
      reduceMotion={reduceMotion}
      onMouseOver={() => setReduceMotion(false)}
    >
      {props.children}
    </Accordion>
  );
}
