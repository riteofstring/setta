import * as Dialog from "@radix-ui/react-dialog";
import { closeModal, useModalData } from "state/actions/modal";
import { deleteJSONSourceFileAndVariant } from "state/actions/project/sectionVariants";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { ModalTypeEnum } from "../types";

export function DeleteJSONSourceVariantModal() {
  const { sectionId, variantId, filepath } = useModalData(
    ModalTypeEnum.DELETE_JSON_SOURCE_FILE,
  );

  const handleCancel = () => {
    closeModal();
  };

  const handleConfirm = async () => {
    await deleteJSONSourceFileAndVariant({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      variantId,
      filepath,
    });
    closeModal();
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center">
      <header className="flex flex-col gap-2 self-start">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <i className="gg-trash h-6 w-6 rounded-full bg-red-100 p-0.5 text-red-600 dark:bg-red-900 dark:text-red-400" />
          </div>

          <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
            Confirm File Deletion
          </Dialog.Title>
        </div>
      </header>
      <Dialog.Description className="mb-4 mt-4 w-full flex-1 text-sm text-setta-600 dark:text-setta-300">
        <p className="">Are you sure you want to delete the following file?</p>
        <div className="mt-2 flex items-center gap-2">
          {/* <i className="gg-folder text-setta-500" /> */}
          <p className="text-lg">{filepath}</p>
        </div>
      </Dialog.Description>
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
