import { initParamSweep } from "state/actions/paramSweep";
import { setSectionInfoAttr } from "state/actions/sectionInfos";
import { useModal, useSectionInfos } from "state/definitions";
import { getForSectionId } from "state/hooks";
import { createNewId } from "utils/idNameCreation";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";

export function CreateNewParamSweepModal() {
  function onClickCreateNewParamSweep({ filename }) {
    const sectionId = useModal.getState().modalData;
    const newId = createNewId();
    initParamSweep({ id: newId, name: filename });
    const forSectionId = getForSectionId(
      useSectionInfos.getState().x,
      sectionId,
    );
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepId",
      value: newId,
    });
    setSectionInfoAttr({
      sectionId: forSectionId,
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
