import { SaveLoadModal } from "components/Modals/SaveLoadModal/SaveLoadModal";
import { useEffect, useState } from "react";
import { dbGetSections, dbLoadSection } from "requests/sections";
import { loadSectionIntoState } from "state/actions/sections/loadSections";
import { useModal } from "state/definitions";

export function LoadSectionModal({ open, modalType }) {
  const [sections, setSections] = useState([]);

  useEffect(() => {
    async function fn() {
      if (open) {
        const res = await dbGetSections();
        if (res.status === 200) {
          setSections([]); // TODO
        }
      }
    }
    fn();
  }, [open]);

  async function onClickLoadSection({ selected }) {
    const res = await dbLoadSection({ sectionId: selected });
    if (res.status === 200) {
      loadSectionIntoState({
        ...res.data,
        ...useModal.getState().modalData,
        topLevelIds: [selected],
      });
    }
  }

  return (
    <SaveLoadModal
      modalPurpose={modalType.purpose}
      files={sections}
      title={modalType.title}
      buttonText={modalType.buttonText}
      onClickActionButton={onClickLoadSection}
    />
  );
}
