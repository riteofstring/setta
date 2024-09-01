import { scaleLinear } from "@visx/scale";
import { animate, useMotionValue } from "framer-motion";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";

export function useAnimatedScale({
  maxPixelRange,
  series,
  attr,
  pixelRangeIncreases,
}) {
  const allValues = _.flatten(series.map((s) => s.values.map((v) => v[attr])));

  const lowerBound = useScaleMotionValue({ isMin: true, allValues });
  const upperBound = useScaleMotionValue({ isMin: false, allValues });

  const scale = useMemo(
    () =>
      scaleLinear <
      number >
      {
        domain: [lowerBound, upperBound],
        range: pixelRangeIncreases ? [0, maxPixelRange] : [maxPixelRange, 0],
      },
    [lowerBound, upperBound, maxPixelRange],
  );

  return scale;
}

function useScaleMotionValue({ isMin, allValues }) {
  const currVal = isMin ? Math.min(...allValues) : Math.max(...allValues);
  const motionValue = useMotionValue(currVal);
  const [scaleState, setScaleState] = useState(motionValue.get());

  useEffect(() => {
    animate(motionValue, currVal, { delay: 0 });
  }, [currVal]);

  useEffect(() => {
    const unsubscribe = motionValue.onChange(setScaleState);
    return unsubscribe;
  }, []);

  return scaleState;
}
