import { MapInteractionCSS } from "react-map-interaction";
import { useState, useEffect } from "react";
import CustomScrollDiv from "./CustomScrollDiv";
import useKeyPress from "../../../../utils/use-key-press";

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

  const _setPanState = (value) => {
    setPanState(value);
    setRelativeY(
      getRelativePosition(value.translation.y, yRange.yMax, scrollHeight)
    );
    setRelativeX(
      getRelativePosition(value.translation.x, xRange.xMax, scrollWidth)
    );
  };

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
    inputMargin
  ) => {
    if (contentDim) {
      return {
        newMax: Math.max(clientDim - scaleOneDim * panState.scale, inputMargin),
        newMin: Math.min(
          0,
          clientDim - scaleOneDim * panState.scale - inputMargin
        ),
      };
    }
    return { newMax: 0, newMin: 0 };
  };

  const getMargin = (clientDim, inputMargin) => {
    return clientDim * inputMargin;
  };

  const setRangeAndScrollDim = (newMargin, isVertical) => {
    if (isVertical) {
      const { newMin, newMax } = getMinMaxCoordinate(
        contentHeight,
        clientHeight,
        scaleOneHeight,
        newMargin
      );
      setYRange({
        yMin: newMin,
        yMax: newMax,
      });
      setScrollHeight(newMax - newMin);
    } else {
      const { newMin, newMax } = getMinMaxCoordinate(
        contentWidth,
        clientWidth,
        scaleOneWidth,
        newMargin
      );
      setXRange({
        xMin: newMin,
        xMax: newMax,
      });
      setScrollWidth(newMax - newMin);
    }
  };

  useEffect(() => {
    setScaleOneHeight(contentHeight / panState.scale);
  }, [contentHeight]);

  useEffect(() => {
    setScaleOneWidth(contentWidth / panState.scale);
  }, [contentWidth]);

  useEffect(() => {
    setRelativeY(
      getRelativePosition(panState.translation.y, yRange.yMax, scrollHeight)
    );
  }, [yRange.yMax, scrollHeight]);

  useEffect(() => {
    setRelativeX(
      getRelativePosition(panState.translation.x, xRange.xMax, scrollWidth)
    );
  }, [xRange.xMax, scrollWidth]);

  useEffect(() => {
    setRangeAndScrollDim(getMargin(clientHeight, yMargin), true);
  }, [clientHeight, panState.scale, scaleOneHeight]);

  useEffect(() => {
    setRangeAndScrollDim(getMargin(clientWidth, xMargin), false);
  }, [clientWidth, panState.scale, scaleOneWidth]);

  return (
    <>
      <MapInteractionCSS
        value={panState}
        onChange={_setPanState}
        disableZoom={!panZoomState}
        translationBounds={{ ...xRange, ...yRange }}
        {...props}
      >
        {props.children}
      </MapInteractionCSS>
      <CustomScrollDiv
        relativePosition={relativeY}
        scrollDim={scrollHeight}
        setRelativePosition={_setRelativeY}
        setClientDim={setClientHeight}
        isVertical={true}
      ></CustomScrollDiv>
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
