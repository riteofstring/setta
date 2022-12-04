import { useStoreState } from "easy-peasy";
import { UI_EDITOR } from "utils/constants";

export function usePaneComboboxWidth() {
  const paneWidth = useStoreState((x) => x.panes.trueWidth[UI_EDITOR]);
  return `${paneWidth - 94}px`;
}
