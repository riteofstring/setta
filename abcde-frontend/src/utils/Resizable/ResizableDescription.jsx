import { motion } from "framer-motion";
import { useSectionDescription } from "models/info/sectionDescription";
import { useEffect, useState } from "react";
import { ResizableWithScale } from "./ResizableWithScale";

export function ResizableDescription({ sectionId, descVis, children }) {
  const height = useSectionDescription((x) => x.x[sectionId].height);
  const setHeight = useSectionDescription((x) => x.setHeight);

  function onResizeStop(e, direction, ref, d) {
    setHeight({ sectionId, height: height + d.height });
  }

  const trueHeight = descVis ? height : 0;
  const minHeight = descVis ? 50 : 0;

  return (
    <MotionDiv height={height} descVis={descVis}>
      <ResizableWithScale
        size={{ height: trueHeight }}
        minHeight={minHeight}
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

function MotionDiv({ height, descVis, children }) {
  const [noDiv, setNoDiv] = useState(false);

  const initial = descVis ? { opacity: 0, height: 0 } : { opacity: 1, height };

  const variants = {
    ease: "easeOut",
    initial,
    open: {
      opacity: 1,
      height,
    },
    collapsed: { opacity: 0, height: 0 },
  };

  useEffect(() => {
    setNoDiv(false);
  }, [descVis]);

  function onAnimationComplete(name) {
    setNoDiv(name === "open");
  }

  return noDiv ? (
    children
  ) : (
    <motion.div
      layout="position"
      className="flex overflow-hidden"
      variants={variants}
      initial={"initial"}
      animate={descVis ? "open" : "collapsed"}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.div>
  );
}
