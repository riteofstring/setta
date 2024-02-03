import { motion } from "framer-motion";
import { setSectionDescriptionHeight } from "hooks/useSectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect, useRef, useState } from "react";
import { VscGrabber } from "react-icons/vsc";
import { ResizableWithScale } from "./ResizableWithScale";

export function ResizableDescription({ sectionId, children }) {
  const height = useSectionInfos((x) => x.x[sectionId].descriptionHeight);

  function onResizeStop(e, direction, ref, d) {
    setSectionDescriptionHeight({ sectionId, height: height + d.height });
  }

  const minHeight = 50;

  return (
    <MotionDiv sectionId={sectionId} height={height}>
      <ResizableWithScale
        size={{ width: "100%", height }}
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
        className="flex flex-1"
        handleComponent={{ bottom: <Handle /> }}
      >
        {children}
      </ResizableWithScale>
    </MotionDiv>
  );
}

function MotionDiv({ sectionId, height, children }) {
  const descVis = useSectionInfos((x) => x.x[sectionId].descriptionVisible);
  const localDescVis = useRef(descVis);
  const [noDiv, setNoDiv] = useState(descVis);
  const [initial, setInitial] = useState(
    descVis ? { opacity: 1, height } : { opacity: 0, height: 0 }
  );

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
    // to prevent running animation on very first render
    if (localDescVis.current !== descVis) {
      setNoDiv(false);
      setInitial(descVis ? { opacity: 0, height: 0 } : { opacity: 1, height });
    }
    localDescVis.current = descVis;
  }, [descVis]);

  function onAnimationComplete(name) {
    setNoDiv(name === "open");
  }

  return noDiv ? (
    children
  ) : (
    <motion.section
      layout="position"
      className="flex overflow-hidden"
      variants={variants}
      initial={"initial"}
      animate={descVis ? "open" : "collapsed"}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </motion.section>
  );
}

function Handle() {
  return (
    <VscGrabber className="absolute bottom-0 left-1/2 z-0 mx-auto mb-3 -translate-x-1/2 select-none text-runcoder-400" />
  );
}
