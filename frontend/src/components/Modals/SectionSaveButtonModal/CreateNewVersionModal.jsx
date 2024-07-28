import { duplicateEvCol } from "state/actions/evCols";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useModal } from "state/definitions";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/getters/sectionInfo";
import { createNewId } from "utils/idNameCreation";
import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";

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
