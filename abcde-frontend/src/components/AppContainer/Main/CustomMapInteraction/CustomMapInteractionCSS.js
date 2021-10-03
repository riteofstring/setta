import { useStoreActions, useStoreState } from "easy-peasy";
import { motion, animate, useMotionValue } from "framer-motion";
import { useState, useEffect } from "react";
import { MapInteractionCSS } from "react-map-interaction";

import graphPaperBg from "../../../../assets/images/graph-paper.svg";
import useKeyPress from "../../../../utils/use-key-press";
import CustomScrollDiv from "./CustomScrollDiv";

export default function CustomMapInteractionCSS(props) {
  const setHovering = useStoreActions(
    (actions) => actions.mapInteraction.setHovering
  );

  const setGoToCoordinates = useStoreActions(
    (actions) => actions.mapInteraction.setGoToCoordinates
  );

  const goToCoordinates = useStoreState(
    (state) => state.mapInteraction.goToCoordinates
  );

  const overviewCssWidth = useStoreState(
    (state) => state.panes.trueWidth["overview"]
  );
  const panZoomState = useKeyPress("Control");
  const { height: contentHeight, width: contentWidth } = props.contentSize;
  const { y: yMargin, x: xMargin } = props.marginRatios;
  const [panStateScale, setPanStateScale] = useState(1);
  const [panStateX, setPanStateX] = useState(0);
  const [panStateY, setPanStateY] = useState(0);
  const motionTranslationX = useMotionValue(0);
  const motionTranslationY = useMotionValue(0);
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
    if (isVertical) {
      setRelativeY(value);
      setRelativeYWasSet(true);
      setPanStateY(yRange.yMax - value * scrollHeight);
    } else {
      setRelativeX(value);
      setRelativeXWasSet(true);
      setPanStateX(xRange.xMax - value * scrollWidth);
    }
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
    currMargin,
    currPanScale,
    currPanTranslation
  ) => {
    const { newMax, newScrollDim } = setRangeAndScrollDim(
      isVertical,
      currContentDim,
      currMargin,
      currPanScale
    );
    const func = isVertical ? setRelativeY : setRelativeX;
    func(
      Math.max(0, getRelativePosition(currPanTranslation, newMax, newScrollDim))
    );
  };

  const getRelativePosition = (coordinate, maxCoordinate, scrollDim) => {
    if (scrollDim > 0) {
      return Math.min(1, (maxCoordinate - coordinate) / scrollDim);
    } else {
      return 1;
    }
  };

  const getMinMaxCoordinate = (contentDim, inputMargin, scale) => {
    if (contentDim) {
      return {
        newMax: inputMargin,
        newMin: -contentDim * scale,
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
    currMargin,
    currPanScale
  ) => {
    const { newMin, newMax } = getMinMaxCoordinate(
      currContentDim,
      currMargin,
      currPanScale
    );
    const newScrollDim = newMax - newMin;
    isVertical
      ? setYRange({ yMin: newMin, yMax: newMax })
      : setXRange({ xMin: newMin, xMax: newMax });
    isVertical ? setScrollHeight(newScrollDim) : setScrollWidth(newScrollDim);
    return { newMax, newScrollDim };
  };

  useEffect(() => {
    setRangeAndScrollDimAndRelativeCoord(
      true,
      contentHeight,
      getMargin(clientHeight, yMargin),
      panStateScale,
      panStateY
    );
  }, [contentHeight, clientHeight]);

  useEffect(() => {
    setRangeAndScrollDimAndRelativeCoord(
      false,
      contentWidth,
      getMargin(clientWidth, xMargin),
      panStateScale,
      panStateX
    );
  }, [contentWidth, clientWidth]);

  useEffect(() => {
    setRangeAndScrollDimAndRelativeCoord(
      true,
      contentHeight,
      getMargin(clientHeight, yMargin),
      panStateScale,
      panStateY
    );
    setRelativeYWasSet(true);
    setRangeAndScrollDimAndRelativeCoord(
      false,
      contentWidth,
      getMargin(clientWidth, xMargin),
      panStateScale,
      panStateX
    );
    setRelativeXWasSet(true);
  }, [panStateScale]);

  useEffect(() => {
    if (!relativeYWasSet) {
      setRelativeY(getRelativePosition(panStateY, yRange.yMax, scrollHeight));
    }
    setRelativeYWasSet(false);
  }, [panStateY]);

  useEffect(() => {
    if (!relativeXWasSet) {
      setRelativeX(getRelativePosition(panStateX, xRange.xMax, scrollWidth));
    }
    setRelativeXWasSet(false);
  }, [panStateX]);

  useEffect(() => {
    if (goToCoordinates !== null) {
      animate(motionTranslationX, goToCoordinates.x, {
        type: "spring",
        duration: 0.2,
        onUpdate: (v) => {
          setPanStateX(v);
        },
      });
      animate(motionTranslationY, goToCoordinates.y, {
        type: "spring",
        duration: 0.2,
        onUpdate: (v) => {
          setPanStateY(v);
        },
      });
    }
    setGoToCoordinates(null);
  }, [goToCoordinates]);

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
          transform: `scale(${panStateScale})`,
          backgroundPosition: `${panStateX}px ${panStateY}px`,
        }}
      >
        <MapInteractionCSS
          value={{
            scale: panStateScale,
            translation: { x: panStateX, y: panStateY },
          }}
          onChange={(v) => {
            setPanStateScale(v.scale);
            setPanStateX(v.translation.x);
            setPanStateY(v.translation.y);
            motionTranslationX.set(v.translation.x);
            motionTranslationY.set(v.translation.y);
          }}
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
