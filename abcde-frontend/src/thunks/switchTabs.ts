import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import {
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
  useUIEditor,
} from "models/uiEditor";

export function goToSectionConfigTab({ paramChildId }) {
  if (paramChildId) {
    const uiEditorState = useUIEditor.getState();
    useActiveSection.getState().setId(paramChildId);
    uiEditorState.setCameFromUIConfig(true);
    uiEditorState.setTab(SECTION_CONFIG_TAB);
  }
}

export function goToParamConfigTab({ sectionId }) {
  const parentId = useSectionInfos.getState().x[sectionId].parentId;
  const uiEditorState = useUIEditor.getState();
  useActiveSection.getState().setId(parentId);
  uiEditorState.setCameFromUIConfig(false);
  uiEditorState.setTab(UI_CONFIG_TAB);
}
