import { useState, useEffect } from "react";
import { Flex, IconButton, Box, GridItem, forwardRef } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion, isValidMotionProp } from "framer-motion";
import { Resizable } from "re-resizable";
import useWindowSize from "../../../../utils/useWindowSize";
import { clamp } from "../../../../utils/utils";
import { useStoreActions, useStoreState } from "easy-peasy";

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
  const { right, paneName } = props.paneProps;
  const vis = useStoreState((state) => state.panes.vis[paneName]);
  const setVis = useStoreActions((actions) => actions.panes.setVis);
  const setTrueWidth = useStoreActions((actions) => actions.panes.setTrueWidth);
  function uiToggle() {
    const newVis = !vis;
    setVis({ paneName, vis: newVis });
    btnDirFlip();
    setTrueWidth({ paneName, trueWidth: newVis ? width : 40 });
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
      setWidth({ paneName, width: newVMax });
      setTrueWidth({ paneName, trueWidth: vis ? newVMax : 40 });
    } else if (width < newVMin) {
      setWidth({ paneName, width: newVMin });
      setTrueWidth({ paneName, trueWidth: vis ? newVMin : 40 });
    }
  }, [vis, size.winWidth]);

  const width = useStoreState((state) => state.panes.width[paneName]);
  const setWidth = useStoreActions((actions) => actions.panes.setWidth);
  const [height, setHeight] = useState("100%");

  const setIsDragging = useStoreActions(
    (actions) => actions.panes.setIsDragging
  );

  const variants = {
    open: { x: "0rem" },
    closed: { x: `${!right ? `-` : ``}${width / 16 - 2.5}rem` },
  };

  if (props && vMin && vMax) {
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
        animate={vis ? "open" : "closed"}
        variants={variants}
        initial={vis ? "open" : "closed"}
        zIndex={10}
        outline="none"
        {...props.dropZoneProps}
      >
        <Resizable
          size={{ width, height }}
          onResizeStart={(e, dir, ref) => {
            setIsDragging({ paneName, isDragging: true });
          }}
          onResizeStop={(e, direction, ref, d) => {
            const newWidth = clamp(width + d.width, vMin, vMax);
            setWidth({ paneName, width: newWidth });
            setTrueWidth({
              paneName,
              trueWidth: vis ? newWidth : 40,
            });
            setHeight(height);
            setIsDragging({ paneName, isDragging: false });
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
