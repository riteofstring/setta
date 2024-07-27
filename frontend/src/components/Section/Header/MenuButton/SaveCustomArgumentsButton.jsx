import { setModalData, setModalType } from "state/actions/modal";
import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";

export function SaveCustomArgumentsButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType("Custom Arguments");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Save Custom Arguments
    </DialogMenuBarTriggerItem>
  );
}
