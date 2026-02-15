import {
  SaveLoadModal,
  SaveLoadModalModeEnum,
} from "components/Modals/SaveLoadModal/SaveLoadModal";
import { useModalData } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import { useNavigateToAnotherConfig } from "state/actions/project/loadProject";
import {
  saveAsNewProjectConfig,
  saveProject,
} from "state/actions/project/saveProject";
import { useProjectState } from "state/definitions";
import { SettaNotificationTypeEnum } from "utils/generatedTypes";
import { ModalTypeEnum } from "../types";
import { useProjectMetadataForFileMenu } from "./utils";

export function FileMenuSaveProjectConfigAsModal({ open }) {
  const projectMetadata = useProjectMetadataForFileMenu(open);
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  const { saveWithRefs } = useModalData(
    ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS,
  );

  async function onClickSaveAsProject({
    selected,
    filename,
  }: {
    selected: string | null;
    filename: string;
  }) {
    if (selected === useProjectState.getState().projectConfig.id) {
      saveProject();
      return;
    }

    if (selected) {
      addTemporaryNotification(
        "Overwriting an existing project config directly is disabled. Use Save As New, then rename or delete configs as needed.",
        SettaNotificationTypeEnum.error,
      );
      return;
    }

    await saveAsNewProjectConfig(filename, saveWithRefs);
    navigateToAnotherConfig(filename);
  }

  return (
    <SaveLoadModal
      modalMode={SaveLoadModalModeEnum.save}
      files={projectMetadata}
      onClickActionButton={onClickSaveAsProject}
      title="Save Project Config As"
      buttonText="Save As"
      placeholder="Project Config Name"
    />
  );
}
