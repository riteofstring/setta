import { motion } from "framer-motion";
import { useSectionDescription } from "models/info/sectionDescription";
import { useState } from "react";
import { ResizableWithScale } from "./ResizableWithScale";

export function ResizableDescription({ sectionId, descVis, children }) {
  const height = useSectionDescription((x) => x.x[sectionId].height);
  const setHeight = useSectionDescription((x) => x.setHeight);
  const [isResizing, setIsResizing] = useState(false);

  function onResizeStart() {
    setIsResizing(true);
  }

  function onResizeStop(e, direction, ref, d) {
    setHeight({ sectionId, height: height + d.height });
    setIsResizing(false);
  }

  const minHeight = 50;

  return (
    <MotionDiv isResizing={isResizing} height={height} descVis={descVis}>
      <ResizableWithScale
        size={{ height }}
        minHeight={minHeight}
        onResizeStart={onResizeStart}
        onResizeStop={onResizeStop}
        handleWrapperClass="nodrag"
        enable={{
          top: false,
          left: false,
          bottom: true,
          right: false,
          bottomRight: false,
        }}
        className="z-[500] flex flex-1"
      >
        {children}
      </ResizableWithScale>
    </MotionDiv>
  );
}

function MotionDiv({ isResizing, height, descVis, children }) {
  const variants = {
    ease: "easeOut",
    initial: { opacity: 0, height: 0 },
    open: {
      opacity: 1,
      height: isResizing ? "auto" : height,
    },
    collapsed: { opacity: 0, height: 0 },
  };

  return (
    <motion.div
      layout="position"
      className="flex overflow-hidden"
      variants={variants}
      initial={"initial"}
      animate={descVis ? "open" : "collapsed"}
    >
      {children}
    </motion.div>
  );
}
