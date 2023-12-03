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
  const modalTypeObj = {
    Load: "Load Project",
    "Save As": "Save Project As",
    "Export JSON": "Export JSON",
    "Export Full JSON": "Export Full JSON",
    "Import JSON": "Import JSON",
  };

  const title = modalTypeObj[modalType];

  function renderModalContent() {
    if (["Export JSON", "Export Full JSON"].includes(modalType)) {
      return (
        <ImportExportModalContent
          projectJson={projectJson}
          title={title}
          copyBtn={true}
          buttonText="Export"
        />
      );
    }
    if (modalType === "Import JSON") {
      return (
        <ImportExportModalContent
          title={title}
          disabled={false}
          buttonText="Import"
        />
      );
    }
    return null;
  }

  const content = renderModalContent();

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
