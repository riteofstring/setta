import { scaleLinear } from "@visx/scale";
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
      scaleLinear({
        domain: [lowerBound, upperBound],
        range: pixelRangeIncreases ? [0, maxPixelRange] : [maxPixelRange, 0],
      }),
    [lowerBound, upperBound, maxPixelRange],
  );

  return scale;
}

function useScaleMotionValue({ isMin, allValues }) {
  const currVal = isMin ? Math.min(...allValues) : Math.max(...allValues);
  const [scaleState, setScaleState] = useState(currVal);

  useEffect(() => {
    let start = scaleState;
    let end = currVal;
    let startTime = performance.now();
    let duration = 50;
    let frameId;

    function animate() {
      let now = performance.now();
      let elapsed = now - startTime;
      let t = Math.min(elapsed / duration, 1);
      let value = start + (end - start) * t;
      setScaleState(value);
      if (t < 1) requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [currVal]);

  return scaleState;
}
