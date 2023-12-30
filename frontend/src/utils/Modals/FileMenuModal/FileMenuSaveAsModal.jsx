import { useGetProjectsForFileMenu } from "hooks/useGetOrCreateProjects";
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
      modalType={"Load"}
      files={projects}
      onClickActionButton={onClickSaveAsProject}
      title={"Save Project As"}
      buttonText={"Load"}
      placeholder="Config Name"
    />
  );
}

// export function FileMenuModal({
//   modalType,
//   projects,
//   projectJson,
//   children,
// }) {
//   const modalTypeObj = {
//     Load: "Load Project",
//     "Save As": "Save Project As",
//     "Export JSON": "Export JSON",
//     "Export Full JSON": "Export Full JSON",
//     "Import JSON": "Import JSON",
//   };

//   const title = modalTypeObj[modalType];

//   function renderModalContent() {
//     if (["Export JSON", "Export Full JSON"].includes(modalType)) {
//       return (
//         <ImportExportModalContent
//           projectJson={projectJson}
//           title={title}
//           copyBtn={true}
//           buttonText="Export"
//         />
//       );
//     }
//     if (modalType === "Import JSON") {
//       return (
//         <ImportExportModalContent
//           title={title}
//           disabled={false}
//           buttonText="Import"
//         />
//       );
//     }
//     return null;
//   }

//   const content = renderModalContent();

//   function onClickLoadProject({ selected }) {
//     const configInfo = projects.find((x) => x.id === selected);
//     if (configInfo) {
//       const { name, projectName } = configInfo;
//       router.navigate(`${projectName}/${name}`, {
//         state: { pageLoadType: NEW_PROJECT },
//       });
//     }
//   }

//   async function onClickSaveAsProject({ selected, filename }) {
//     if (selected === useProjectConfig.getState().id) {
//       saveProject();
//     } else {
//       selected
//         ? await saveAsExistingProjectConfig({
//             configName: filename,
//           })
//         : await saveAsNewProjectConfig({
//             newConfigName: filename,
//           });

//       const projectName = useProject.getState().name;
//       router.navigate(`${projectName}/${filename}`, {
//         state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG },
//       });
//     }
//   }

//   const onClickActionButton =
//     modalType === "Load" ? onClickLoadProject : onClickSaveAsProject;

//   return (
//     <SaveLoadModal
//       modalType={modalType}
//       files={projects}
//       onClickActionButton={onClickActionButton}
//       title={title}
//       buttonText={modalType}
//       placeholder="Config Name"
//       content={content}
//     >
//       {children}
//     </SaveLoadModal>
//   );
// }
