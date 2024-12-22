import * as Dialog from "@radix-ui/react-dialog";
import { BiErrorCircle } from "react-icons/bi";
import { dbDeleteFile } from "requests/jsonSource";
import { setModalOpen } from "state/actions/modal";
import { setNotificationMessage } from "state/actions/notification";
import {
  fileDeletionRequestId,
  setTemporaryMiscState,
} from "state/actions/temporaryMiscState";
import { useModal } from "state/definitions";

export function DeleteFileModal() {
  const filepath = useModal((x) => x.modalData);

  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleConfirm = async () => {
    const res = await dbDeleteFile(filepath);
    if (res.status == 200) {
      // allows function that opened modal to find out if file was deleted
      setTemporaryMiscState(fileDeletionRequestId(filepath), true);
      setNotificationMessage("Deleted file");
    } else {
      setTemporaryMiscState(fileDeletionRequestId(filepath), false);
      setNotificationMessage("File deletion failed");
    }
    setModalOpen(false);
  };

  return (
    <div className="mx-auto flex h-full w-full flex-col items-center">
      <header className="flex flex-col gap-2 self-start">
        <div className="flex items-center gap-2">
          <BiErrorCircle className="h-6 w-6 rounded-full bg-red-100 p-0.5 text-red-600 dark:bg-red-700 dark:text-red-200" />
          <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
            Confirm File Deletion
          </Dialog.Title>
        </div>
        <Dialog.Description className="mb-4 text-sm text-setta-600 dark:text-setta-300">
          Are you sure you want to delete the following file? {filepath}
        </Dialog.Description>
      </header>
      {/* Fixed footer section */}
      <div className="flex w-full justify-end space-x-3 border-t border-setta-200 pt-4 dark:border-setta-700">
        <button
          onClick={handleCancel}
          className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="cursor-pointer rounded-full bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 dark:hover:bg-red-800"
        >
          Delete File
        </button>
      </div>
    </div>
  );
}
