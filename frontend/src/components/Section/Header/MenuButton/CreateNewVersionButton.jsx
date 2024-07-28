import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";
import { setModalData, setModalType } from "state/actions/modal";
import { MODAL_TYPE } from "utils/constants";

export function CreateNewVersionButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType(MODAL_TYPE.NEW_VERSION);
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
