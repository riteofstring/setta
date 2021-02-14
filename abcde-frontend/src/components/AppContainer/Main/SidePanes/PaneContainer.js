import { useState, useEffect } from "react";
import { Flex, IconButton, Box, forwardRef } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion, isValidMotionProp } from "framer-motion";

const Pane = motion.custom(
  forwardRef((props, ref) => {
    const chakraProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !isValidMotionProp(key))
    );
    return <Box ref={ref} {...chakraProps} />;
  })
);

export default function PaneContainer(props) {
  const { variants, width, right } = props.paneProps;
  const [uiVis, setUiVis] = useState(true);
  function uiToggle() {
    setUiVis(!uiVis);
    btnDirFlip();
  }
  const [btnDir, setBtnDir] = useState(uiVis);
  function btnDirFlip() {
    setBtnDir(!btnDir);
  }

  useEffect(() => {
    if (!right) {
      btnDirFlip();
    }
  }, []);

  if (props) {
    return (
      <Pane animate={uiVis ? "open" : "closed"} variants={variants}>
        <Flex
          zIndex="2"
          py="2rem"
          pr={right && "3rem"}
          pl={!right && "3rem"}
          bg="gray.50"
          w={width}
          height="100%"
          direction={right && "row-reverse"}
        >
          <Flex
            bg="whiteAlpha"
            flexDirection="column"
            height="100%"
            minW="12.5rem"
            w="100%"
            id="nestedFlexThing"
          >
            {props.children}
          </Flex>
          <IconButton
            icon={btnDir ? <HiChevronRight /> : <HiChevronLeft />}
            color="gray.500"
            bg="whiteAlpha"
            size="sm"
            ml="0.25rem"
            mr="0.5rem"
            alignSelf="center"
            onClick={uiToggle}
          />
        </Flex>
      </Pane>
    );
  } else {
    return null;
  }
}
