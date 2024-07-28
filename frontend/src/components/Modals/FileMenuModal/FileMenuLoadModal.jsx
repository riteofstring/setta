import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { LOAD_PROJECT_CONFIG } from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";

export function FileMenuLoadModal({ open, modalType }) {
  const projectConfigs = useGetAllProjectConfigMetadataForFileMenu(open);

  function onClickLoadProjectConfig({ selected }) {
    const config = projectConfigs.find((x) => x.id === selected);
    if (config) {
      router.navigate(config.name, {
        state: { pageLoadType: LOAD_PROJECT_CONFIG },
      });
    }
  }

  return (
    <SaveLoadModal
      modalPurpose={modalType.purpose}
      files={projectConfigs}
      onClickActionButton={onClickLoadProjectConfig}
      title={modalType.title}
      buttonText={modalType.buttonText}
    />
  );
}
