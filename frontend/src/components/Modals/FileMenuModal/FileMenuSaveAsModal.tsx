import {
  SaveLoadModal,
  SaveLoadModalModeEnum,
} from "components/Modals/SaveLoadModal/SaveLoadModal";
import _ from "lodash";
import { useNavigateToAnotherConfig } from "state/actions/project/loadProject";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "state/actions/project/saveProject";
import { useProjectState } from "state/definitions";
import { MODAL_TYPE } from "utils/constants";
import { useProjectMetadataForFileMenu } from "./utils";

export function FileMenuSaveProjectConfigAsModal({ open }) {
  const projectMetadata = useProjectMetadataForFileMenu(open);
  const navigateToAnotherConfig = useNavigateToAnotherConfig();

  async function onClickSaveAsProject({ selected, filename }) {
    if (selected === useProjectState.getState().projectConfig.id) {
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

      navigateToAnotherConfig(filename);
    }
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
