import React, { useState, useCallback, useEffect, useRef } from "react";
import "./onHoverStyle.css";
import { motion } from "framer-motion";
import { useAtomValue, selectAtom } from "jotai/utils";
import { hovering as hoveringState } from "./mapState";
import {
  trueWidth as trueWidthState,
  vis as visState,
  isDragging as isDraggingState,
} from "../SidePanes/paneState";

const SCROLL_BOX_MIN_HEIGHT = 20;

export default function CustomScrollDiv({
  relativePosition,
  setRelativePosition,
  setClientDim,
  scrollDim,
  children,
  isVertical,
}) {
  const mapHovering = useAtomValue(hoveringState);
  const paneTrueWidths = useAtomValue(trueWidthState);
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
      const { clientHeight: clientDim, offsetHeight: offsetDim } =
        scrollHostElement;
      return { clientDim, offsetDim };
    } else {
      const { clientWidth: clientDim, offsetWidth: offsetDim } =
        scrollHostElement;
      return { clientDim, offsetDim };
    }
  };

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
    setClientDim(scrollHostUseEffectCondition());
  }, [scrollHostUseEffectCondition(), paneTrueWidths]);

  return (
    <CustomScrollDivMotionWrapper isVertical={isVertical}>
      <div
        ref={scrollHostRef}
        className={isVertical ? `vertical-scrollhost` : `horizontal-scrollhost`}
      >
        {children}
      </div>
      <div
        className={isVertical ? "vertical-scroll-bar" : "horizontal-scroll-bar"}
        style={{ opacity: mapHovering || hovering || isDragging ? 1 : 0.5 }}
        onMouseOver={() => setHovering(true)}
        onMouseOut={() => setHovering(false)}
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

function CustomScrollDivMotionWrapper({ isVertical, children }) {
  return isVertical
    ? VerticalScrollDiv({ children })
    : HorizontalScrollDiv({ children });
}

function VerticalScrollDiv({ children }) {
  const vis = useAtomValue(selectAtom(visState, (x) => x.uiEditor));
  const trueWidth = useAtomValue(selectAtom(trueWidthState, (x) => x.uiEditor));
  const draggingPane = useAtomValue(
    selectAtom(isDraggingState, (x) => x.uiEditor)
  );

  const variants = {
    closed: { x: `-${trueWidth}px` },
    open: { x: `-${trueWidth}px` },
  };

  return !draggingPane ? (
    <motion.div
      className="vertical-scrollhost-container"
      animate={vis ? "open" : "closed"}
      variants={variants}
      initial={vis ? "open" : "closed"}
      style={{ zIndex: "20" }}
    >
      {children}
    </motion.div>
  ) : (
    <div className={"vertical-scrollhost-container"}>{children}</div>
  );
}

function HorizontalScrollDiv({ children }) {
  const overviewTrueWidth = useAtomValue(
    selectAtom(trueWidthState, (x) => x.overview)
  );
  const uiEditorTrueWidth = useAtomValue(
    selectAtom(trueWidthState, (x) => x.uiEditor)
  );
  const anyPanesDragging = Object.values(
    useAtomValue(isDraggingState)
  ).includes(true);

  const getTotalMargin = () => {
    return `(${overviewTrueWidth}px + ${uiEditorTrueWidth}px)`;
  };

  return (
    <div
      className={"horizontal-scrollhost-container"}
      style={{
        opacity: `${anyPanesDragging ? 0 : 1}`,
        width: `calc(100% - ${getTotalMargin()})`,
        left: `${overviewTrueWidth}px`,
      }}
    >
      {children}
    </div>
  );
}
