import { useGetProjectsForFileMenu } from "state/hooks/useGetOrCreateProjects";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect } from "react";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { SAME_PROJECT_NEW_PROJECT_CONFIG } from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function FileMenuSaveAsModal({ open }) {
  const { projects, getProjects } = useGetProjectsForFileMenu();

  useEffect(() => {
    if (open) {
      getProjects({ projectId: useProject.getState().id });
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

      const projectName = useProject.getState().name;
      router.navigate(`${projectName}/${filename}`, {
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
