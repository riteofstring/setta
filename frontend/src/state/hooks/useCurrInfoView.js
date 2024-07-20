import { useInfoView } from "state/definitions/infoView";

export function useSetCurrInfoView(value) {
  const setCurr = useInfoView((x) => x.setCurr);

  function onMouseOver() {
    setCurr(value);
  }

  function onMouseLeave() {
    setCurr("");
  }

  return { onMouseOver, onMouseLeave };
}

export function useCurrInfoView() {
  return useInfoView((x) => x.currValue);
}
