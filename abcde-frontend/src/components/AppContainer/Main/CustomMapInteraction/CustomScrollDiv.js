import React, { useState, useCallback, useEffect, useRef } from "react";
import "./onHoverStyle.css";

const SCROLL_BOX_MIN_HEIGHT = 20;

export default function CustomScrollDiv({
  relativePosition,
  setRelativePosition,
  setClientDim,
  scrollDim,
  children,
  className,
  isVertical,
  leftEdge,
  rightEdge,
  ...restProps
}) {
  const [hovering, setHovering] = useState(false);
  const [lastScrollThumbPosition, setScrollThumbPosition] = useState(0);
  const [scrollBoxHeight, setScrollBoxHeight] = useState(SCROLL_BOX_MIN_HEIGHT);
  const [scrollBoxTop, setScrollBoxTop] = useState(0);
  const [isDragging, setDragging] = useState(false);

  const getActualScrollDim = (clientDim) => {
    return scrollDim + clientDim;
  };

  const getScrollThumbHeight = (clientDim) => {
    const actualScrollDim = getActualScrollDim(clientDim);
    const scrollThumbPercentage = clientDim / actualScrollDim;
    return Math.max(scrollThumbPercentage * clientDim, SCROLL_BOX_MIN_HEIGHT);
  };

  const getClientDim = (scrollHostElement) => {
    if (isVertical) {
      const {
        clientHeight: clientDim,
        offsetHeight: offsetDim,
      } = scrollHostElement;
      return { clientDim, offsetDim };
    } else {
      let {
        clientWidth: clientDim,
        offsetWidth: offsetDim,
      } = scrollHostElement;
      clientDim -= leftEdge + rightEdge
      offsetDim -= leftEdge + rightEdge
      return { clientDim, offsetDim };
    }
  };

  const handleMouseOver = useCallback(() => {
    !hovering && setHovering(true);
  }, [hovering]);

  const handleMouseOut = useCallback(() => {
    !!hovering && setHovering(false);
  }, [hovering]);

  const handleDocumentMouseUp = useCallback(
    (e) => {
      if (isDragging) {
        e.preventDefault();
        setDragging(false);
      }
    },
    [isDragging]
  );

  const handleDocumentMouseMove = useCallback(
    (e) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        const scrollHostElement = scrollHostRef.current;

        const { clientDim, offsetDim } = getClientDim(scrollHostElement);

        const actualScrollDim = getActualScrollDim(clientDim);

        let coordinate = isVertical ? e.clientY : e.clientX;
        let delta = coordinate - lastScrollThumbPosition;
        let percentage = delta * (actualScrollDim / offsetDim);

        setScrollThumbPosition(coordinate);

        // const minCoord = isVertical ? 0 : leftEdge

        const newScrollBoxTop = Math.min(
          Math.max(0, scrollBoxTop + delta),
          offsetDim - scrollBoxHeight
        );

        // console.log("newScrollBoxTop", newScrollBoxTop)

        setScrollBoxTop(newScrollBoxTop);

        const scrollThumbHeight = getScrollThumbHeight(clientDim);
        setRelativePosition(newScrollBoxTop / (clientDim - scrollThumbHeight));

        scrollHostElement.scrollTop = Math.min(
          scrollHostElement.scrollTop + percentage,
          actualScrollDim - offsetDim
        );
      }
    },
    [isDragging, lastScrollThumbPosition, scrollBoxHeight, scrollBoxTop]
  );

  const handleScrollThumbMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setScrollThumbPosition(isVertical ? e.clientY : e.clientX);
    setDragging(true);
  }, []);

  const scrollHostRef = useRef();

  useEffect(() => {
    const scrollHostElement = scrollHostRef.current;
    const { clientDim } = getClientDim(scrollHostElement);
    const scrollThumbHeight = getScrollThumbHeight(clientDim);
    const topOfScrollThumb = (clientDim - scrollThumbHeight) * relativePosition;
    setScrollBoxTop(topOfScrollThumb);
  }, [relativePosition, scrollDim]);

  useEffect(() => {
    const scrollHostElement = scrollHostRef.current;
    const { clientDim } = getClientDim(scrollHostElement);
    const scrollThumbHeight = getScrollThumbHeight(clientDim);
    setScrollBoxHeight(scrollThumbHeight);
  }, [scrollDim]);

  useEffect(() => {
    //this is handle the dragging on scroll-thumb
    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
    document.addEventListener("mouseleave", handleDocumentMouseUp);
    return function cleanup() {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
      document.removeEventListener("mouseleave", handleDocumentMouseUp);
    };
  }, [handleDocumentMouseMove, handleDocumentMouseUp]);

  const scrollHostUseEffectCondition = () => {
    if (isVertical) {
      return scrollHostRef.current
        ? scrollHostRef.current.clientHeight
        : scrollHostRef.current;
    } else {
      return scrollHostRef.current
        ? scrollHostRef.current.clientWidth
        : scrollHostRef.current;
    }
  };

  useEffect(() => {
    setClientDim(getClientDim(scrollHostRef.current).clientDim);
  }, [scrollHostUseEffectCondition(), leftEdge, rightEdge]);

  return (
    <div
      className={
        isVertical
          ? "vertical-scrollhost-container"
          : "horizontal-scrollhost-container"
      }
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <div
        ref={scrollHostRef}
        className={isVertical ? `vertical-scrollhost` : `horizontal-scrollhost`}
        {...restProps}
      >
        {children}
      </div>
      <div
        className={isVertical ? "vertical-scroll-bar" : "horizontal-scroll-bar"}
        style={{ opacity: hovering ? 1 : 0 }}
      >
        <div
          className={
            isVertical ? "vertical-scroll-thumb" : "horizontal-scroll-thumb"
          }
          style={
            isVertical
              ? { height: scrollBoxHeight, top: scrollBoxTop }
              : { width: scrollBoxHeight, left: scrollBoxTop }
          }
          onMouseDown={handleScrollThumbMouseDown}
        />
      </div>
    </div>
  );
}
