import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { LOAD_PROJECT_CONFIG } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "state/actions/project/saveProject";
import { useProjectConfig } from "state/definitions";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";

export function FileMenuSaveAsModal({ open, modalType }) {
  const projectConfigs = useGetAllProjectConfigMetadataForFileMenu(open);

  async function onClickSaveAsProject({ selected, filename }) {
    if (selected === useProjectConfig.getState().id) {
      saveProject();
    } else {
      selected
        ? await saveAsExistingProjectConfig({
            configName: filename,
          })
        : await saveAsNewProjectConfig({
            newConfigName: filename,
          });

      router.navigate(filename, {
        state: { pageLoadType: LOAD_PROJECT_CONFIG },
      });
    }
  }

  return (
    <SaveLoadModal
      modalPurpose={modalType.purpose}
      files={projectConfigs}
      onClickActionButton={onClickSaveAsProject}
      title={modalType.title}
      buttonText={modalType.buttonText}
      placeholder="Project Config Name"
    />
  );
}
