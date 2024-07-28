import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { LOAD_PROJECT_CONFIG } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";

export function FileMenuLoadModal({ open, modalType }) {
  const projects = useGetAllProjectConfigMetadataForFileMenu(open);

  function onClickLoadProjectConfig({ selected }) {
    const configInfo = projects.find((x) => x.id === selected);
    if (configInfo) {
      router.navigate(configInfo.name, {
        state: { pageLoadType: LOAD_PROJECT_CONFIG },
      });
    }
  }

  console.log("modalType", modalType)

  return (
    <SaveLoadModal
      modalPurpose={modalType.purpose}
      files={projects}
      onClickActionButton={onClickLoadProjectConfig}
      title={modalType.title}
      buttonText={modalType.buttonText}
      placeholder="Project Config Name"
    />
  );
}
