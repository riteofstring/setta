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
import { NotificationTypeEnum } from "utils/generatedTypes";
import { ModalTypeEnum } from "../types";
import { useProjectMetadataForFileMenu } from "./utils";

export function FileMenuSaveProjectConfigAsModal({ open }: { open: boolean }) {
  const projectMetadata = useProjectMetadataForFileMenu(open);
  const navigateToAnotherConfig = useNavigateToAnotherConfig();
  const { saveWithRefs } = useModalData(
    ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS,
  );
  const currentProjectConfigName = useProjectState((x) => x.projectConfig.name);

  async function onClickSaveAsProject({
    filename,
  }: {
    selectedName: string | null;
    filename: string;
  }) {
    const normalizedFilename = filename.trim();
    if (!normalizedFilename) {
      return;
    }

    if (normalizedFilename === currentProjectConfigName) {
      saveProject();
      return;
    }

    const existingTarget = projectMetadata.find(
      (x) => x.name === normalizedFilename,
    );
    if (existingTarget) {
      addTemporaryNotification(
        "Overwriting an existing project config directly is disabled. Use Save As New, then rename or delete configs as needed.",
        NotificationTypeEnum.error,
      );
      return;
    }

    await saveAsNewProjectConfig(normalizedFilename, saveWithRefs);
    navigateToAnotherConfig(normalizedFilename);
  }

  return (
    <SaveLoadModal
      open={open}
      modalMode={SaveLoadModalModeEnum.save}
      files={projectMetadata}
      onClickActionButton={onClickSaveAsProject}
      title="Save Project Config As"
      buttonText="Save As"
      placeholder="Project Config Name"
    />
  );
}
