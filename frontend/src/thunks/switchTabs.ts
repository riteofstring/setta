import { useActiveSection } from "models/activeSection";
import {
  SECTION_CONFIG_TAB,
  UI_CONFIG_TAB,
  useUIEditor,
} from "models/uiEditor";
import { getParamChildId } from "./paramInfos";
import { getSectionParentId } from "./sections/getters";

export function goToSectionConfigTab({ sectionId, paramInfoId }) {
  if (paramInfoId) {
    const paramChildId = getParamChildId(sectionId, paramInfoId);
    if (paramChildId) {
      const uiEditorState = useUIEditor.getState();
      useActiveSection.getState().setId(paramChildId);
      uiEditorState.setCameFromUIConfig(true);
      uiEditorState.setTab(SECTION_CONFIG_TAB);
    }
  }
}

export function goToParamConfigTab({ sectionId }) {
  const parentId = getSectionParentId(sectionId);
  const uiEditorState = useUIEditor.getState();
  useActiveSection.getState().setId(parentId);
  uiEditorState.setCameFromUIConfig(false);
  uiEditorState.setTab(UI_CONFIG_TAB);
}
