import { scaleOrdinal } from "@visx/scale";
import { schemeSet1 } from "d3-scale-chromatic";
import { useMemo } from "react";

export function useColorScale(series) {
  const seriesNames = series.map((x) => x.name);
  return useMemo(
    () =>
      scaleOrdinal({
        domain: seriesNames,
        range: schemeSet1,
      }),
    [JSON.stringify(seriesNames)]
  );
}
