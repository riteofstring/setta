import { setSectionInfoAttr } from "state/actions/setters";
import { useModal } from "state/definitions/modal";
import { useParamSweep } from "state/definitions/paramSweep";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { getForSectionId } from "state/hooks/useParamSweepInfo";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function CreateNewParamSweepModal() {
  function onClickCreateNewParamSweep({ filename }) {
    const sectionId = useModal.getState().modalData;
    const newId = createNewId();
    useParamSweep.getState().initParamSweep({ id: newId, name: filename });
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
