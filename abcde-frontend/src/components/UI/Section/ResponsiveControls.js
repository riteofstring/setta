import { useStoreState } from "easy-peasy";
import { animate } from "framer-motion";
import { useEffect, useState } from "react";
import { Controls } from "react-flow-renderer";
import { OVERVIEW } from "utils/constants";

export function ResponsiveControls() {
  const overviewCssWidth = useStoreState((x) => x.panes.trueWidth[OVERVIEW]);
  const [x, setX] = useState(overviewCssWidth);

  // I tried wrapping Controls with motion.div, which would be simpler
  // because then useEffect and useState could be removed.
  // But it doesn't work for some reason
  useEffect(() => {
    if (x !== overviewCssWidth) {
      animate(x, overviewCssWidth, {
        type: "spring",
        duration: 0.5,
        onUpdate: (v) => {
          setX(v);
        },
      });
    }
  }, [overviewCssWidth]);

  return <Controls style={{ transform: `translate(${x}px, 0px)` }} />;
}
