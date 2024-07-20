import { duplicateEvCol } from "state/actions/evCols";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { useModal } from "state/definitions/modal";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/getters/sectionInfo";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function CreateNewVersionModal() {
  function onClickCreateNewVersion({ filename }) {
    const sectionId = useModal.getState().modalData;
    const currId = getSectionInfo(sectionId).evColId;
    const dbSource = getMappedSectionDBSource(sectionId);
    const newId = createNewId();
    duplicateEvCol({ dbSource, id: currId, newId, newName: filename });
    setSectionInfoAttr({ sectionId, attr: "evColId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "evColIds",
      newValueFn: (x) => [...x, newId],
    });
  }

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={[]} // TODO
      onClickActionButton={onClickCreateNewVersion}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    />
  );
}
