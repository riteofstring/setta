import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { useProjectsForLoadMenu } from "state/hooks/project";

export function FileMenuLoadModal({ open }) {
  const { projects, onClickLoadProject } = useProjectsForLoadMenu(open);

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
