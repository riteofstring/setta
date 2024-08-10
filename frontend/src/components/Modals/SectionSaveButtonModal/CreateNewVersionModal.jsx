import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { setSectionConfigAttr } from "state/actions/sectionConfigs";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { duplicateSectionVariant } from "state/actions/sectionVariants";
import { useModal, useSectionConfigs } from "state/definitions";
import { getMappedSectionDBSource } from "state/getters/sectionInfo";
import { createNewId } from "utils/idNameCreation";

export function CreateNewVersionModal({ modalType }) {
  function onClickCreateNewVersion({ filename }) {
    const sectionId = useModal.getState().modalData;
    const currId = useSectionConfigs.getState().x[sectionId].variantId;
    const dbSource = getMappedSectionDBSource(sectionId);
    const newId = createNewId();
    duplicateSectionVariant({ dbSource, id: currId, newId, newName: filename });
    setSectionConfigAttr({ sectionId, attr: "variantId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "variantIds",
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
