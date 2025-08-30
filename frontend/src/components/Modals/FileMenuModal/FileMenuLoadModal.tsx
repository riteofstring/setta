import {
  SaveLoadModal,
  SaveLoadModalModeEnum,
} from "components/Modals/SaveLoadModal/SaveLoadModal";
import _ from "lodash";
import { useEffect } from "react";
import {
  loadAllProjectMetadata,
  useNavigateToAnotherConfig,
} from "state/actions/project/loadProject";
import { useAllProjectMetadata } from "state/definitions";

export function FileMenuLoadProjectConfigModal({ open }: { open: boolean }) {
  const projectMetadata = useAllProjectMetadata(
    (x) => x.projectMetadata.map((m) => ({ id: m.id, name: m.name })),
    _.isEqual,
  );
  const navigateToAnotherConfig = useNavigateToAnotherConfig();

  useEffect(() => {
    if (open) {
      loadAllProjectMetadata();
    }
  }, [open]);

  function onClickLoadProjectConfig({
    selected,
  }: {
    selected: string | undefined;
  }) {
    if (selected === undefined) {
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
