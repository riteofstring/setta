import { setModalData, setModalType } from "state/actions/modal";
import { DialogMenuBarTriggerItem } from "components/Utils/atoms/dialog/dialogTriggerItem";
import { MODAL_TYPE } from "utils/constants";

export function CreateNewParamSweepButton({ sectionId }) {
  function openModal() {
    setModalData(sectionId);
    setModalType(MODAL_TYPE.NEW_PARAM_SWEEP);
  }

  return (
    <DialogMenuBarTriggerItem onClick={openModal}>
      New Version
    </DialogMenuBarTriggerItem>
  );
}
