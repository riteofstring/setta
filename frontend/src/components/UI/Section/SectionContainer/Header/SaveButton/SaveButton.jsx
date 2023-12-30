import { useModal } from "models/modal";
import { FiSave } from "react-icons/fi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";

export function SaveButton({ sectionId }) {
  const setModalType = useModal((x) => x.setModalType);
  const setModalData = useModal((x) => x.setModalData);

  function openCustomArgumentsModal() {
    setModalType("Custom Arguments");
  }

  function openEnteredValuesModal() {
    setModalData(sectionId);
    setModalType("Create New Entered Values");
  }

  return (
    <StandardDropdown
      trigger={
        <IconButton
          color="text-runcoder-300"
          bg="bg-transparent ml-1 p-1 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300"
          icon={<FiSave />}
        />
      }
      content={
        <>
          <DialogDropdownTriggerItem onClick={openCustomArgumentsModal}>
            Save Custom Arguments
          </DialogDropdownTriggerItem>
          <DialogDropdownTriggerItem onClick={openEnteredValuesModal}>
            Create New Entered Values
          </DialogDropdownTriggerItem>
        </>
      }
    />
  );
}
