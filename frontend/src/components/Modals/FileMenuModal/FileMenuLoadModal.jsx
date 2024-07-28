import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { LOAD_PROJECT_CONFIG } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";

export function FileMenuLoadModal({ open }) {
  const projects = useGetAllProjectConfigMetadataForFileMenu(open);

  function onClickLoadProjectConfig({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      router.navigate(configInfo.name, {
        state: { pageLoadType: LOAD_PROJECT_CONFIG },
      });
    }
  }

  return (
    <SaveLoadModal
      modalType={"Load"}
      files={projects}
      onClickActionButton={onClickLoadProjectConfig}
      title={"Load Project"}
      buttonText={"Load"}
      placeholder="Config Name"
    />
  );
}
