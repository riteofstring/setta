import { animate } from "framer-motion";
import { useSectionDescription } from "models/info/sectionDescription";
import { useEffect, useState } from "react";
import { ResizableWithScale } from "./ResizableWithScale";

export function ResizableDescription({ sectionId, descVis, children }) {
  const height = useSectionDescription((x) => x.x[sectionId].height);
  const setHeight = useSectionDescription((x) => x.setHeight);
  const [shouldUseMotionHeight, setShouldUseMotionHeight] = useState(false);
  const [motionHeight, setMotionHeight] = useState(descVis ? height : 0);

  useEffect(() => {
    setShouldUseMotionHeight(true);
    const endVal = descVis ? height : 0;
    animate(motionHeight, endVal, {
      onUpdate: (v) => setMotionHeight(v),
      onComplete: () => setShouldUseMotionHeight(false),
    });
  }, [descVis]);

  function onResizeStop(e, direction, ref, d) {
    const newHeight = height + d.height;
    setHeight({ sectionId, height: newHeight });
    setMotionHeight(newHeight);
  }
  const minHeight = !descVis || shouldUseMotionHeight ? 0 : 50;
  const trueHeight = shouldUseMotionHeight
    ? motionHeight
    : descVis
    ? height
    : 0;

  const zIndex = descVis ? 500 : 0;

  return (
    <ResizableWithScale
      size={{ height: trueHeight }}
      minHeight={minHeight}
      // onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
      handleWrapperClass="nodrag"
      enable={{
        top: false,
        left: false,
        bottom: true,
        right: false,
        bottomRight: false,
      }}
      className={`z-[${zIndex}] flex flex-1`}
    >
      {children}
    </ResizableWithScale>
  );
}
