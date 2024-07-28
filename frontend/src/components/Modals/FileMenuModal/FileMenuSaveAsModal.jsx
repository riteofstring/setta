import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { SAME_PROJECT_NEW_PROJECT_CONFIG } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useEffect } from "react";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "state/actions/project/saveProject";
import { useProjectConfig } from "state/definitions";
import { useGetProjectConfigMetadatas } from "state/hooks/project";

export function FileMenuSaveAsModal({ open }) {
  const { projects, getProjectConfigMetadatas } =
    useGetProjectConfigMetadatas();

  useEffect(() => {
    if (open) {
      getProjectConfigMetadatas();
    }
  }, [open]);

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
        state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG },
      });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Save Project As"}
      files={projects}
      onClickActionButton={onClickSaveAsProject}
      title={"Save Project As"}
      buttonText={"Save Project As"}
      placeholder="Config Name"
    />
  );
}
