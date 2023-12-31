import { useParamInfos } from "models/info/paramInfos";
import { useModal } from "models/modal";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function CreateNewEnteredValuesModal() {
  const sectionId = useModal((x) => x.modalData);

  function onClickCreateNewEnteredValues({ filename }) {
    const currId = getSectionInfo(sectionId).evColId;
    const newId = createNewId();
    useParamInfos
      .getState()
      .duplicateEvCol({ id: currId, newId, newName: filename });
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
      onClickActionButton={onClickCreateNewEnteredValues}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
    />
  );
}
