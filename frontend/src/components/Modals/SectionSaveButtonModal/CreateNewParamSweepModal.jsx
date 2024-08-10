import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { initParamSweep } from "state/actions/runGroups/paramSweep";
import { setSectionConfigAttr } from "state/actions/sectionConfigs";
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
    setSectionConfigAttr({
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
      modalPurpose={modalType.purpose}
      files={[]} // TODO
      onClickActionButton={onClickCreateNewParamSweep}
      title={modalType.title}
      buttonText={modalType.buttonText}
      placeholder="Param Sweep Name"
    />
  );
}
