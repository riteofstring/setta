import { useUIEditor } from "state/definitions";

export function setUIEditorTab(payload) {
  useUIEditor.setState(() => ({ tab: payload }));
}
