import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { useNavigate } from "react-router-dom";
import { useGetAllProjectConfigMetadataForFileMenu } from "state/hooks/project";
import { PAGE_LOAD_TYPES } from "utils/constants";

export function FileMenuLoadModal({ open, modalType }) {
  const projectConfigs = useGetAllProjectConfigMetadataForFileMenu(open);
  const navigate = useNavigate();

  function onClickLoadProjectConfig({ selected }) {
    const config = projectConfigs.find((x) => x.id === selected);
    if (config) {
      navigate(config.name, {
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
