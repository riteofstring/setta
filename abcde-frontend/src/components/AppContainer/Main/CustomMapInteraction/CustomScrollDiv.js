import React, { useState, useCallback, useEffect, useRef } from "react";
import "./onHoverStyle.css";
import { motion } from "framer-motion";
import { useStoreState } from "easy-peasy";

const SCROLL_BOX_MIN_HEIGHT = 20;

export default function CustomScrollDiv({
  relativePosition,
  setRelativePosition,
  setClientDim,
  scrollDim,
  children,
  className,
  isVertical,
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
      const {
        clientWidth: clientDim,
        offsetWidth: offsetDim,
      } = scrollHostElement;
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

        const newScrollBoxTop = Math.min(
          Math.max(0, scrollBoxTop + delta),
          offsetDim - scrollBoxHeight
        );

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
    setClientDim(scrollHostRef.current.clientHeight);
  }, [scrollHostUseEffectCondition()]);

  return (
    <CustomScrollDivMotionWrapper
      isVertical={isVertical}
      handleMouseOver={handleMouseOver}
      handleMouseOut={handleMouseOut}
    >
      <div
        ref={scrollHostRef}
        className={isVertical ? `vertical-scrollhost` : `horizontal-scrollhost`}
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
    </CustomScrollDivMotionWrapper>
  );
}

function CustomScrollDivMotionWrapper({
  isVertical,
  handleMouseOver,
  handleMouseOut,
  children,
}) {
  const vis = useStoreState((state) => state.panes.vis["uiEditor"]);
  const width = useStoreState((state) => state.panes.width["uiEditor"]);

  const variants = {
    closed: { x: "-2.5rem" },
    open: { x: `-${width / 16}rem` },
  };

  return isVertical ? (
    <motion.div
      className={
        isVertical
          ? "vertical-scrollhost-container"
          : "horizontal-scrollhost-container"
      }
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      animate={vis ? "open" : "closed"}
      variants={variants}
      initial={vis ? "open" : "closed"}
    >
      {children}
    </motion.div>
  ) : (
    <div
      className={
        isVertical
          ? "vertical-scrollhost-container"
          : "horizontal-scrollhost-container"
      }
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {children}
    </div>
  );
}
