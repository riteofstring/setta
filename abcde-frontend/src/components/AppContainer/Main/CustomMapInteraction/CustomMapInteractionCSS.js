import { MapInteractionCSS } from "react-map-interaction";
import { useState, useEffect } from "react";
import CustomScrollDiv from "./CustomScrollDiv";
import useKeyPress from "../../../../utils/use-key-press";
import { useStoreActions, useStoreState } from "easy-peasy";
import { motion } from "framer-motion";
import graphPaperBg from "../../../../assets/images/graph-paper.svg";

export default function CustomMapInteractionCSS(props) {
  const setHovering = useStoreActions(
    (actions) => actions.mapInteraction.setHovering
  );

  const setScale = useStoreActions(
    (actions) => actions.mapInteraction.setScale
  );

  const goToHeight = useStoreState((state) => state.mapInteraction.goToHeight);

  const overviewCssWidth = useStoreState(
    (state) => state.panes.trueWidth["overview"]
  );
  const panZoomState = useKeyPress("Control");
  const { height: contentHeight, width: contentWidth } = props.contentSize;
  const { y: yMargin, x: xMargin } = props.marginRatios;
  const [panState, setPanState] = useState({
    scale: 1,
    translation: { x: 0, y: 0 },
  });
  const [scaleOneHeight, setScaleOneHeight] = useState(contentHeight);
  const [scaleOneWidth, setScaleOneWidth] = useState(contentWidth);
  const [yRange, setYRange] = useState({ yMin: 0, yMax: 0 });
  const [xRange, setXRange] = useState({ xMin: 0, xMax: 0 });
  const [clientHeight, setClientHeight] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [relativeY, setRelativeY] = useState(0);
  const [relativeX, setRelativeX] = useState(0);
  const [relativeYWasSet, setRelativeYWasSet] = useState(false);
  const [relativeXWasSet, setRelativeXWasSet] = useState(false);

  const _setRelative = (value, isVertical) => {
    isVertical ? setRelativeY(value) : setRelativeX(value);
    isVertical ? setRelativeYWasSet(true) : setRelativeXWasSet(true);
    setPanState({
      scale: panState.scale,
      translation: {
        x: isVertical
          ? panState.translation.x
          : xRange.xMax - value * scrollWidth,
        y: isVertical
          ? yRange.yMax - value * scrollHeight
          : panState.translation.y,
      },
    });
  };

  const _setRelativeY = (value) => {
    _setRelative(value, true);
  };

  const _setRelativeX = (value) => {
    _setRelative(value, false);
  };

  const setRangeAndScrollDimAndRelativeCoord = (
    isVertical,
    currContentDim,
    currClientDim,
    currScaleOneDim,
    currMargin,
    currPanState
  ) => {
    const { newMax, newScrollDim } = setRangeAndScrollDim(
      isVertical,
      currContentDim,
      currClientDim,
      currScaleOneDim,
      currMargin,
      currPanState
    );
    const func = isVertical ? setRelativeY : setRelativeX;
    func(
      Math.max(
        0,
        getRelativePosition(
          isVertical ? currPanState.translation.y : currPanState.translation.x,
          newMax,
          newScrollDim
        )
      )
    );
  };

  const getRelativePosition = (coordinate, maxCoordinate, scrollDim) => {
    if (scrollDim > 0) {
      return Math.min(1, (maxCoordinate - coordinate) / scrollDim);
    } else {
      return 1;
    }
  };

  const getMinMaxCoordinate = (
    contentDim,
    clientDim,
    scaleOneDim,
    inputMargin,
    scale
  ) => {
    if (contentDim) {
      return {
        newMax: Math.max(clientDim - scaleOneDim * scale, inputMargin),
        newMin: Math.min(0, clientDim - scaleOneDim * scale - inputMargin),
      };
    }
    return { newMax: 0, newMin: 0 };
  };

  const getMargin = (clientDim, inputMargin) => {
    return clientDim * inputMargin;
  };

  const setRangeAndScrollDim = (
    isVertical,
    currContentDim,
    currClientDim,
    currScaleOneDim,
    currMargin,
    currPanState
  ) => {
    const { newMin, newMax } = getMinMaxCoordinate(
      currContentDim,
      currClientDim,
      currScaleOneDim,
      currMargin,
      currPanState.scale
    );
    const newScrollDim = newMax - newMin;
    isVertical
      ? setYRange({ yMin: newMin, yMax: newMax })
      : setXRange({ xMin: newMin, xMax: newMax });
    isVertical ? setScrollHeight(newScrollDim) : setScrollWidth(newScrollDim);
    return { newMax, newScrollDim };
  };

  useEffect(() => {
    const newScaleOneHeight = contentHeight / panState.scale;
    setScaleOneHeight(newScaleOneHeight);
    setRangeAndScrollDimAndRelativeCoord(
      true,
      contentHeight,
      clientHeight,
      newScaleOneHeight,
      getMargin(clientHeight, yMargin),
      panState
    );
  }, [contentHeight, clientHeight]);

  useEffect(() => {
    const newScaleOneWidth = contentWidth / panState.scale;
    setScaleOneWidth(newScaleOneWidth);
    setRangeAndScrollDimAndRelativeCoord(
      false,
      contentWidth,
      clientWidth,
      newScaleOneWidth,
      getMargin(clientWidth, xMargin),
      panState
    );
  }, [contentWidth, clientWidth]);

  useEffect(() => {
    setRangeAndScrollDimAndRelativeCoord(
      true,
      contentHeight,
      clientHeight,
      scaleOneHeight,
      getMargin(clientHeight, yMargin),
      panState
    );
    setRelativeYWasSet(true);
    setRangeAndScrollDimAndRelativeCoord(
      false,
      contentWidth,
      clientWidth,
      scaleOneWidth,
      getMargin(clientWidth, xMargin),
      panState
    );
    setRelativeXWasSet(true);
    setScale(panState.scale)
  }, [panState.scale]);

  useEffect(() => {
    if (!relativeYWasSet) {
      setRelativeY(
        getRelativePosition(panState.translation.y, yRange.yMax, scrollHeight)
      );
    }
    setRelativeYWasSet(false);
  }, [panState.translation.y]);

  useEffect(() => {
    if (!relativeXWasSet) {
      setRelativeX(
        getRelativePosition(panState.translation.x, xRange.xMax, scrollWidth)
      );
    }
    setRelativeXWasSet(false);
  }, [panState.translation.x]);


  useEffect(() => {
    if (goToHeight !== null) {
      setPanState({
        scale: panState.scale,
        translation: { x: panState.translation.x, y: -goToHeight },
      });
    }
  }, [goToHeight]);

  return (
    <>
      <CustomScrollDiv
        relativePosition={relativeY}
        scrollDim={scrollHeight}
        setRelativePosition={_setRelativeY}
        setClientDim={setClientHeight}
        isVertical={true}
      ></CustomScrollDiv>
      <motion.div
        onMouseOver={() => setHovering(true)}
        onMouseOut={() => setHovering(false)}
        animate={{ translateX: overviewCssWidth }}
        initial={false}
        style={{
          height: "inherit",
          backgroundImage: `url(${graphPaperBg})`,
          transform: `scale(${panState.scale})`,
          backgroundPosition: `${panState.translation.x}px ${panState.translation.y}px`,
        }}
      >
        <MapInteractionCSS
          value={panState}
          onChange={setPanState}
          disableZoom={!panZoomState}
          translationBounds={{ ...xRange, ...yRange }}
          {...props}
        >
          {props.children}
        </MapInteractionCSS>
      </motion.div>
      <CustomScrollDiv
        relativePosition={relativeX}
        scrollDim={scrollWidth}
        setRelativePosition={_setRelativeX}
        setClientDim={setClientWidth}
        isVertical={false}
      ></CustomScrollDiv>
    </>
  );
}
