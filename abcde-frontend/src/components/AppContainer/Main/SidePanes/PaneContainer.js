import { useState, useEffect } from "react";
import { Flex, IconButton, Box, forwardRef } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion, isValidMotionProp } from "framer-motion";
import { Rnd } from "react-rnd";

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
      <Pane
        height="100%"
        zIndex="10"
        animate={uiVis ? "visible" : "invisible"}
        variants={variants}
        border="1px"
        borderColor="gray.500"
      >
        <Rnd
          default={{
            x: 0,
            y: 0,
            width: 320,
            height: "100%",
          }}
          maxWidth="900px"
          minWidth="200px"
          enableResizing={{
            top: false,
            right: !right,
            bottom: false,
            left: right,
            topRight: false,
            bottomRight: false,
            bottomLeft: false,
            topLeft: false,
          }}
          bounds="parent"
          disableDragging
        >
          <Flex
            zIndex="2"
            py="2rem"
            pr={right && "3rem"}
            pl={!right && "3rem"}
            bg="gray.50"
            w="100%"
            height="100%"
            direction={right && "row-reverse"}
            overflow="auto"
          >
            <Flex
              bg="whiteAlpha"
              flexDirection="column"
              height="100%"
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
        </Rnd>
      </Pane>
    );
  } else {
    return null;
  }
}
