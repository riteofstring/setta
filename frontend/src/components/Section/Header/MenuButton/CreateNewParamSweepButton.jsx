import { setModalData, setModalType } from "state/actions/modal";
import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";

export function CreateNewParamSweepButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType("New Param Sweep");
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
