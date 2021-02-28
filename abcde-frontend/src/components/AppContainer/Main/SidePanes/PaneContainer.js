import { useState, useEffect } from "react";
import { Flex, IconButton, Box, GridItem, forwardRef } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion, isValidMotionProp } from "framer-motion";
import { Resizable } from "re-resizable";
import useWindowSize from "../../../../utils/useWindowSize";
import { clamp } from "../../../../utils/utils";

const Pane = motion.custom(
  forwardRef((props, ref) => {
    const chakraProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !isValidMotionProp(key))
    );
    return <GridItem ref={ref} {...chakraProps} />;
  })
);

export default function PaneContainer(props) {
  const size = useWindowSize();
  const { defaultWidth, right, openOnLoad } = props.paneProps;
  const [vis, setVis] = useState(openOnLoad ? true : false);
  function uiToggle() {
    setVis(!vis);
    btnDirFlip();
  }
  const [btnDir, setBtnDir] = useState(vis);
  function btnDirFlip() {
    setBtnDir(!btnDir);
  }

  useEffect(() => {
    if (!right) {
      btnDirFlip();
    }
  }, []);

  const [vMax, setVMax] = useState(50);
  const [vMin, setVMin] = useState(50);

  useEffect(() => {
    const newVMax = size.winWidth / 2.1;
    const newVMin = clamp(size.winWidth / 5, 50, 250);
    setVMax(newVMax);
    setVMin(newVMin);
    if (width > newVMax) {
      setWidth(newVMax);
    } else if (width < newVMin) {
      setWidth(newVMin);
    }
  }, [vis, size.winWidth]);

  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState("100%");

  const variants = {
    open: { x: "0rem" },
    closed: { x: `${!right ? `-` : ``}${width / 16 - 2.5}rem` },
  };

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
        // position="absolute"
        justifySelf={right ? "flex-end" : "flex-start"}
        right={right ? 0 : "auto"}
        left={!right ? 0 : "auto"}
        animate={vis ? "open" : "closed"}
        variants={variants}
        initial={vis ? "open" : "closed"}
        zIndex={10}
      >
        <Resizable
          size={{ width, height }}
          onResizeStop={(e, direction, ref, d) => {
            setWidth(clamp(width + d.width, vMin, vMax));
            setHeight(height);
          }}
          maxWidth={vMax}
          minWidth={vMin}
          enable={{
            top: false,
            right: vis && !right,
            bottom: false,
            left: vis && right,
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
            <Box
              display="inline-block"
              py="2rem"
              px="2.66rem"
              bg="gray.50"
              w="inherit"
              h="inherit"
              // direction={right && "row-reverse"}
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
                variant="ghost"
                size="sm"
                left={right ? 0 : "auto"}
                right={!right ? 0 : "auto"}
                top="0"
                margin="0.33rem"
                alignSelf="center"
                onClick={uiToggle}
                h="calc(100% - .66rem)"
                tabIndex="-1"
                position="absolute"
                _focus={{ shadow: "none" }}
              />
            </Box>
          </Box>
        </Resizable>
      </Pane>
    );
  } else {
    return null;
  }
}
