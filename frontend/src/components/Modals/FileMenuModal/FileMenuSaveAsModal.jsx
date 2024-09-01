import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { router } from "components/Pages/router";
import _ from "lodash";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "state/actions/project/saveProject";
import { useProjectConfig } from "state/definitions";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";
import { MODAL_TYPE, PAGE_LOAD_TYPES } from "utils/constants";

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
            withRefs: _.isEqual(
              modalType,
              MODAL_TYPE.SAVE_PROJECT_CONFIG_AS_WITH_REFS,
            ),
          });

      router.navigate(filename, {
        state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
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
