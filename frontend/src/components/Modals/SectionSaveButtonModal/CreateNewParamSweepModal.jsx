import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { initParamSweep } from "state/actions/runGroups/paramSweep";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useModal, useSectionInfos } from "state/definitions";
import { getForSectionId } from "state/hooks/paramSweep";
import { createNewId } from "utils/idNameCreation";

export function CreateNewParamSweepModal({ modalType }) {
  function onClickCreateNewParamSweep({ filename }) {
    const sectionId = useModal.getState().modalData;
    const newId = createNewId();
    initParamSweep({ id: newId, name: filename });
    const forSectionId = getForSectionId(
      useSectionInfos.getState().x,
      sectionId,
    );
    useSectionInfos.setState((x) => {
      x.sectionConfigs[forSectionId].paramSweepId = newId;
    });
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepIds",
      newValueFn: (x) => [...x, newId],
    });
  }

  return (
    <SaveLoadModal
      modalPurpose={modalType.purpose}
      files={[]} // TODO
      onClickActionButton={onClickCreateNewParamSweep}
      title={modalType.title}
      buttonText={modalType.buttonText}
      placeholder="Param Sweep Name"
    />
  );
}
