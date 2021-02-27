import { useState, useEffect } from "react";
import { Flex, IconButton, Box, GridItem, forwardRef } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion, isValidMotionProp } from "framer-motion";
import { Resizable } from "re-resizable";

const Pane = motion.custom(
  forwardRef((props, ref) => {
    const chakraProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !isValidMotionProp(key))
    );
    return <GridItem ref={ref} {...chakraProps} />;
  })
);

export default function PaneContainer(props) {
  const { defaultWidth, right, openOnLoad } = props.paneProps;
  const [uiVis, setUiVis] = useState(openOnLoad ? true : false);
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

  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState("100%");

  const variants = {
    open: { x: "0rem" },
    closed: { x: `${!right ? `-` : ``}${width / 16 - 2.5}rem` },
  };

  console.log(uiVis);
  if (props) {
    return (
      <Pane
        h="100%"
        colStart="1"
        colEnd="2"
        rowStart="2"
        rowEnd="3"
        minH="0"
        minW="0"
        justifySelf={right ? "flex-end" : "flex-start"}
        right={right ? 0 : "auto"}
        left={!right ? 0 : "auto"}
        animate={uiVis ? "open" : "closed"}
        variants={variants}
        initial={uiVis ? "open" : "closed"}
        zIndex={10}
      >
        <Resizable
          size={{ width, height }}
          onResizeStop={(e, direction, ref, d) => {
            setWidth(width + d.width);
            setHeight(height);
          }}
          maxWidth="900px"
          minWidth="200px"
          enable={{
            top: false,
            right: uiVis && !right,
            bottom: false,
            left: uiVis && right,
            topRight: false,
            bottomRight: false,
            bottomLeft: false,
            topLeft: false,
          }}
        >
          <Box
            h="inherit"
            borderRight="1px"
            borderColor="gray.200"
            boxShadow="md"
            w="100%"
          >
            <Flex
              py="2rem"
              pr={right && "3rem"}
              pl={!right && "3rem"}
              bg="gray.50"
              w="inherit"
              h="inherit"
              direction={right && "row-reverse"}
              overflow="noscroll"
            >
              <Flex
                bg="whiteAlpha"
                flexDirection="column"
                h="inherit"
                w="inherit"
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
          </Box>
        </Resizable>
      </Pane>
    );
  } else {
    return null;
  }
}
