import { scaleOrdinal } from "@visx/scale";
import { interpolateTurbo } from "d3-scale-chromatic";
import _ from "lodash";
import { useMemo } from "react";

export function useColorScale(series) {
  const seriesNames = series.map((x) => x.name);
  const upperBound = 0.8;
  const lowerBound = 0.2;
  const stepSize = (upperBound - lowerBound) / (seriesNames.length - 1);
  const nums = _.range(lowerBound, upperBound + stepSize, stepSize);
  const colors = nums.map((i) => interpolateTurbo(i));

  return useMemo(
    () =>
      scaleOrdinal({
        domain: seriesNames,
        range: colors,
      }),
    [JSON.stringify(seriesNames)],
  );
}
