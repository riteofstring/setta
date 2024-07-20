import { dbGetSections, dbLoadSection } from "dbRequests/sections";
import { useModal } from "models/modal";
import { useEffect, useState } from "react";
import { loadSectionIntoState } from "state/actions/createSectionOrDeck";
import { SaveLoadModal } from "utils/Modals/SaveLoadModal/SaveLoadModal";

export function LoadSectionModal({ open }) {
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
      modalType={"Load"}
      files={sections}
      title={"Load Section"}
      buttonText={"Load"}
      onClickActionButton={onClickLoadSection}
    />
  );
}
