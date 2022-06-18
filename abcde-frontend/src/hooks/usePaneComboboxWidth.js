const { useStoreState } = require("easy-peasy");
const { UI_EDITOR } = require("utils/constants");

export function usePaneComboboxWidth() {
  const paneWidth = useStoreState((x) => x.panes.trueWidth[UI_EDITOR]);
  return `${paneWidth - 94}px`;
}
