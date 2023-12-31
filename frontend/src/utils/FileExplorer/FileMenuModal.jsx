import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import {
  saveAsExistingProjectConfig,
  saveAsNewProjectConfig,
  saveProject,
} from "thunks/save";
import { ImportExportModalContent } from "utils/ImportExportModal/ImportExportModal";
import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";
import { SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";

export function FileMenuModal({
  modalType,
  projects,
  projectJson,
  open,
  setOpen,
  children,
}) {
  const content =
    modalType === "Export JSON" ? (
      <ImportExportModalContent projectJson={projectJson} />
    ) : null;

  function onClickLoadProject({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      const { name, projectName } = configInfo;
      router.navigate(`${projectName}/${name}`, {
        state: { pageLoadType: NEW_PROJECT },
      });
    }
  }

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

  const onClickActionButton =
    modalType === "Load" ? onClickLoadProject : onClickSaveAsProject;
  const title = modalType === "Load" ? "Load Project" : "Save Project As";

  return (
    <SaveLoadModal
      modalType={modalType}
      files={projects}
      onClickActionButton={onClickActionButton}
      title={title}
      buttonText={modalType}
      placeholder="Config Name"
      open={open}
      setOpen={setOpen}
      content={content}
    >
      {children}
    </SaveLoadModal>
  );
}
