import { useInfoView } from "state/definitions";

export function useCurrInfoView() {
  return useInfoView((x) => x.currValue);
}
