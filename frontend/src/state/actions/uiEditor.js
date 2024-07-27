import { useUIEditor } from "state/definitions/uiEditor";

export function setUIEditorTab(payload) {
  useUIEditor.setState(() => ({ tab: payload }));
}
