import { usePanes } from "models/panes";
import { UI_EDITOR } from "utils/constants";

export function usePaneComboboxWidth() {
  const paneWidth = usePanes((x) => x.trueWidth[UI_EDITOR]);
  return `${paneWidth - 94}px`;
}
