import { useEffect } from "react";
import { useGetProjectsForFileMenu } from "state/hooks/project";
import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { NEW_PROJECT } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";

export function FileMenuLoadModal({ open }) {
  const { projects, getProjects } = useGetProjectsForFileMenu();

  useEffect(() => {
    if (open) {
      getProjects({});
    }
  }, [open]);

  function onClickLoadProject({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      const { name, projectName } = configInfo;
      router.navigate(`${projectName}/${name}`, {
        state: { pageLoadType: NEW_PROJECT },
      });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      files={projects}
      onClickActionButton={onClickLoadProject}
      title={"Load Project"}
      buttonText={"Load"}
      placeholder="Config Name"
    />
  );
}
