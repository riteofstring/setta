import {
  SaveLoadModal,
  SaveLoadModalModeEnum,
} from "components/Modals/SaveLoadModal/SaveLoadModal";
import { useNavigateToAnotherConfig } from "state/actions/project/loadProject";
import { useProjectMetadataForFileMenu } from "./utils";

export function FileMenuLoadProjectConfigModal({ open }: { open: boolean }) {
  const projectMetadata = useProjectMetadataForFileMenu(open);
  const navigateToAnotherConfig = useNavigateToAnotherConfig();

  function onClickLoadProjectConfig({ selected }: { selected: string | null }) {
    if (selected === null) {
      return;
    }
    const config = projectMetadata.find((x) => x.id === selected);
    if (config) {
      navigateToAnotherConfig(config.name);
    }
  }

  return (
    <SaveLoadModal
      modalMode={SaveLoadModalModeEnum.load}
      files={projectMetadata}
      onClickActionButton={onClickLoadProjectConfig}
      title="Load Project Config"
      buttonText="Load"
      placeholder=""
    />
  );
}
