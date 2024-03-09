import { localPoint } from "@visx/event";
import { bisector } from "d3-array";
import { useCallback, useEffect } from "react";

const bisectX = bisector((d) => d.x).center;

export function useTooltipMouseOverHandler({
  showTooltip,
  xScale,
  yScale,
  margin,
  series,
}) {
  useEffect(() => {
    showTooltip((curr) => {
      const tloc = curr.tooltipLocation;
      if (!tloc) {
        return curr;
      }
      return getTooltipFromMouseLocation({
        x: tloc.x,
        y: tloc.y,
        series,
        xScale,
        yScale,
        margin,
      });
    });
  }, [xScale, yScale]);

  return useCallback(
    (event) => {
      const { x, y } = localPoint(event) || { x: 0, y: 0 };
      const tooltipInfo = getTooltipFromMouseLocation({
        x,
        y,
        series,
        xScale,
        yScale,
        margin,
      });
      showTooltip(() => tooltipInfo);
    },
    [xScale, yScale, margin.top, margin.left, margin.right, margin.bottom],
  );
}

function getDatapointFromX(name, values, x, xScale, yScale, margin) {
  const index = bisectX(values, x);
  const d0 = values[index - 1];
  const d1 = values[index];
  let d = d0 ? d0 : d1;
  if (d1 && d1.x) {
    d = x - d0.x > d1.x - x ? d1 : d0;
  }
  return {
    name,
    data: d,
    x: xScale(d.x) + margin.left,
    y: yScale(d.y) + margin.top,
  };
}

function getTooltipFromMouseLocation({ x, y, series, xScale, yScale, margin }) {
  const x0 = xScale.invert(x - margin.left);
  const ds = series.map((s) =>
    getDatapointFromX(s.name, s.values, x0, xScale, yScale, margin),
  );
  return {
    tooltipLineX: x,
    tooltipData: ds,
    tooltipLocation: { x, y },
  };
}
