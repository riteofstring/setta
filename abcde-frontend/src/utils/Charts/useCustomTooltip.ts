import { useCallback, useEffect, useState } from "react";

export function useCustomTooltip({ tooltipLineY: inputTooltipLineY }) {
  const [tooltipState, setTooltipState] = useState({
    tooltipLineX: undefined,
    tooltipData: undefined,
    tooltipLocation: undefined,
  });

  const [tooltipLineY, setTooltipLineY] = useState(inputTooltipLineY);

  useEffect(() => {
    setTooltipLineY(inputTooltipLineY);
  }, [inputTooltipLineY.from, inputTooltipLineY.to]);

  const showTooltip = useCallback(
    (newStateFn) => setTooltipState(newStateFn),
    [setTooltipState]
  );

  const hideTooltip = useCallback(
    () =>
      setTooltipState({
        tooltipLineX: undefined,
        tooltipData: undefined,
        tooltipLocation: undefined,
      }),
    [setTooltipState]
  );

  return {
    tooltipLineX: tooltipState.tooltipLineX,
    tooltipLineY,
    tooltipData: tooltipState.tooltipData,
    tooltipLocation: tooltipState.tooltipLocation,
    showTooltip,
    hideTooltip,
  };
}
