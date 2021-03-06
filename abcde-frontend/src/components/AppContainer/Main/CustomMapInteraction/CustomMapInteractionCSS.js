import { MapInteractionCSS } from "react-map-interaction";
import { useState, useEffect } from "react";
import CustomScrollDiv from "./CustomScrollDiv";
import useKeyPress from "../../../../utils/use-key-press";
import { useStoreActions } from "easy-peasy";

export default function CustomMapInteractionCSS(props) {
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

  const _setRelative = (value, isVertical) => {
    isVertical ? setRelativeY(value) : setRelativeX(value);
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
      getRelativePosition(
        isVertical ? currPanState.translation.y : currPanState.translation.x,
        newMax,
        newScrollDim
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
    setRangeAndScrollDimAndRelativeCoord(
      false,
      contentWidth,
      clientWidth,
      scaleOneWidth,
      getMargin(clientWidth, xMargin),
      panState
    );
  }, [panState]);

  // console.log("panState.translation.y", panState.translation.y);
  // console.log("scaleOneHeight", scaleOneHeight);
  // console.log("relativeY", relativeY);
  // console.log("clientHeight", clientHeight);
  // console.log("yMax", yRange.yMax);
  // console.log("yMin", yRange.yMin);
  // console.log("relativeY", relativeY);
  // console.log("scrollHeight", scrollHeight);

  // useEffect(() => {
  //   setRelativeY(
  //     getRelativePosition(panState.translation.y, yRange.yMax, scrollHeight)
  //   );
  // }, [panState.translation.y]);

  // useEffect(() => {
  //   setRelativeX(
  //     getRelativePosition(panState.translation.x, xRange.xMax, scrollWidth)
  //   );
  // }, [panState.translation.x]);

  const setHovering = useStoreActions(
    (actions) => actions.mapInteraction.setHovering
  );

  // console.log("panState.scale", panState.scale);
  // console.log("scaleOneHeight", scaleOneHeight);
  // console.log("relativeY", relativeY);
  // console.log("yRange", yRange.yMax, yRange.yMin);
  // console.log("scrollHeight", scrollHeight);
  // console.log("clientHeight", clientHeight);

  return (
    <>
      <CustomScrollDiv
        relativePosition={relativeY}
        scrollDim={scrollHeight}
        setRelativePosition={_setRelativeY}
        setClientDim={setClientHeight}
        isVertical={true}
      ></CustomScrollDiv>
      <div
        onMouseOver={() => setHovering(true)}
        onMouseOut={() => setHovering(false)}
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
      </div>
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
