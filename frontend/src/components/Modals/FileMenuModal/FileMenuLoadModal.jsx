import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { getRouter } from "components/Pages/router";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";
import { PAGE_LOAD_TYPES } from "utils/constants";

export function FileMenuLoadModal({ open, modalType }) {
  const projectConfigs = useGetAllProjectConfigMetadataForFileMenu(open);

  function onClickLoadProjectConfig({ selected }) {
    const config = projectConfigs.find((x) => x.id === selected);
    if (config) {
      getRouter().navigate(config.name, {
        state: { pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG },
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
