import { Accordion } from "@chakra-ui/react";
import { useState } from "react";

export default function ReduceMotionAccordian(props) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const { borderTopColor = "", borderBottomColor = "" } = props;

  return (
    <Accordion
      {...props}
      reduceMotion={reduceMotion}
      onMouseOver={() => setReduceMotion(false)}
      borderTopColor={borderTopColor}
      borderBottomColor={borderBottomColor}
      borderTopStyle="none"
    >
      {props.children}
    </Accordion>
  );
}
