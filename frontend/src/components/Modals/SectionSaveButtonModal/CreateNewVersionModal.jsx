import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { duplicateEvCol } from "state/actions/evCols";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useModal } from "state/definitions";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/getters/sectionInfo";
import { createNewId } from "utils/idNameCreation";

export function CreateNewVersionModal({ modalType }) {
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
      modalPurpose={modalType.purpose}
      files={[]} // TODO
      onClickActionButton={onClickCreateNewVersion}
      title={modalType.title}
      buttonText={modalType.buttonText}
      placeholder="Collection Name"
    />
  );
}
