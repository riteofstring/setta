import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";
import { setModalData, setModalType } from "state/actions/modal";
import { MODAL_TYPE } from "utils/constants";

export function SaveCustomArgumentsButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType(MODAL_TYPE.SAVE_CUSTOM_ARGUMENTS);
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Save Custom Arguments
    </DialogMenuBarTriggerItem>
  );
}
