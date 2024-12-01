import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";
import { useModal } from "state/definitions";
import { MODAL_TYPE } from "utils/constants";

export function SaveCustomArgumentsButton({ sectionId }) {
  function openModal() {
    useModal.setState({
      modalData: sectionId,
      modalType: MODAL_TYPE.SAVE_CUSTOM_ARGUMENTS,
    });
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      Save Custom Arguments
    </DialogMenuBarTriggerItem>
  );
}
