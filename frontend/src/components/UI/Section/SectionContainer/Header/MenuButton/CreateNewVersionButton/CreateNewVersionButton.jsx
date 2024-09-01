import { setModalData, setModalType } from "state/actions/modal";
import { DialogMenuBarTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";

export function CreateNewVersionButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType("New Version");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
