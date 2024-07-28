import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { NEW_PROJECT } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";

export function FileMenuLoadModal({ open }) {
  const projects = useGetAllProjectConfigMetadataForFileMenu(open);

  function onClickLoadProject({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      router.navigate(configInfo.name, {
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
