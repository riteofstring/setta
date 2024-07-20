import { useParamInfos } from "models/info/paramInfos";
import { useModal } from "models/modal";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "state/sectionInfos/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function CreateNewVersionModal() {
  function onClickCreateNewVersion({ filename }) {
    const sectionId = useModal.getState().modalData;
    const currId = getSectionInfo(sectionId).evColId;
    const dbSource = getMappedSectionDBSource(sectionId);
    const newId = createNewId();
    useParamInfos
      .getState()
      .duplicateEvCol({ dbSource, id: currId, newId, newName: filename });
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
