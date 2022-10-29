import { Box, GridItem, Heading, IconButton } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { motion } from "framer-motion";
import useWindowSize from "hooks/useWindowSize";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { MIN_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

const Pane = motion(GridItem);

export default function PaneContainer(props) {
  const {
    boxH = "inherit",
    boxW = "100%",
    boxBorderRight = "1px",
    boxBorderColor = "gray.200",
    boxBoxShadow = "md",
    boxDisplay = "inline-block",
    boxPy = "2rem",
    boxPx = "2.66rem",
    boxBg = "gray.50",
    paneTitle = null,
    onResizeStop = null,
  } = props;
  const size = useWindowSize();
  const { right, paneName } = props.paneProps;
  const vis = useStoreState((state) => state.panes.vis[paneName]);
  const setVis = useStoreActions((actions) => actions.panes.setVis);
  const setTrueWidth = useStoreActions((actions) => actions.panes.setTrueWidth);
  function uiToggle() {
    const newVis = !vis;
    setVis({ paneName, vis: newVis });
    btnDirFlip();
    setTrueWidth({ paneName, trueWidth: newVis ? width : MIN_PANE_WIDTH });
    if (onResizeStop) {
      const widthDiff = width - MIN_PANE_WIDTH;
      onResizeStop(newVis ? widthDiff : -widthDiff);
    }
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
    const newVMin = 340;
    setVMax(newVMax);
    setVMin(newVMin);
    if (width > newVMax) {
      setWidth({ paneName, width: newVMax });
      setTrueWidth({ paneName, trueWidth: vis ? newVMax : MIN_PANE_WIDTH });
    } else if (width < newVMin) {
      setWidth({ paneName, width: newVMin });
      setTrueWidth({ paneName, trueWidth: vis ? newVMin : MIN_PANE_WIDTH });
    }
  }, [vis, size.winWidth]);

  const width = useStoreState((state) => state.panes.width[paneName]);
  const setWidth = useStoreActions((actions) => actions.panes.setWidth);
  const height = "100%";

  const variants = {
    open: { x: "0rem" },
    closed: { x: `${!right ? `-` : ``}${width / 16 - 2.5}rem` },
  };

  function localOnResizeStop(e, direction, ref, d) {
    const newWidth = clamp(width + d.width, vMin, vMax);
    if (newWidth === width) {
      return;
    }
    setWidth({ paneName, width: newWidth });
    setTrueWidth({
      paneName,
      trueWidth: vis ? newWidth : MIN_PANE_WIDTH,
    });
    if (onResizeStop) {
      onResizeStop(d.width);
    }
  }

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
        aria-label={`${paneTitle} Pane`}
      >
        <Resizable
          size={{ width, height }}
          onResizeStop={localOnResizeStop}
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
            h={boxH}
            w={boxW}
            borderRight={boxBorderRight}
            borderColor={boxBorderColor}
            boxShadow={boxBoxShadow}
            display={boxDisplay}
            py={boxPy}
            px={boxPx}
            bg={boxBg}
          >
            <Heading
              as="h2"
              size="md"
              color="gray.300"
              pb=".75rem"
              textTransform="uppercase"
              letterSpacing="widest"
            >
              {paneTitle}
            </Heading>
            {props.children}
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
        </Resizable>
      </Pane>
    );
  } else {
    return null;
  }
}
