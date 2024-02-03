import { useModal } from "models/modal";
import { useParamSweep } from "models/paramSweep";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function CreateNewParamSweepModal() {
  function onClickCreateNewParamSweep({ filename }) {
    const sectionId = useModal.getState().modalData;
    const newId = createNewId();
    useParamSweep.getState().initParamSweep({ id: newId, name: filename });
    setSectionInfoAttr({ sectionId, attr: "paramSweepId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "paramSweepIds",
      newValueFn: (x) => [...x, newId],
    });
  }

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={[]} // TODO
      onClickActionButton={onClickCreateNewParamSweep}
      title="Save Param Sweep As"
      buttonText="Save As"
      placeholder="Param Sweep Name"
    />
  );
}
