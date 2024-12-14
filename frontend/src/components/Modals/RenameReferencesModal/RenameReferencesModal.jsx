import * as Dialog from "@radix-ui/react-dialog";
import { BiErrorCircle } from "react-icons/bi";
import { setModalOpen } from "state/actions/modal";

export function RenameReferencesModal() {
  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleConfirm = async () => {
    // TODO
  };

  const referencesToBeUpdated = ["this", "is", "a", "test"];

  return (
    <div className="mx-auto flex h-full w-full flex-col items-center">
      <header className="flex flex-col gap-2 self-start">
        <div className="flex items-center gap-2">
          <BiErrorCircle className="h-6 w-6 rounded-full bg-red-100 p-0.5 text-red-600 dark:bg-red-700 dark:text-red-200" />
          <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
            Rename References
          </Dialog.Title>
        </div>
        <Dialog.Description className="mb-4 text-sm text-setta-600 dark:text-setta-300">
          The section you moved is referenced to by other sections. Would you
          like to update those references?
        </Dialog.Description>
      </header>
      {/* Scrollable content section */}
      <div className="mb-6 w-full flex-grow overflow-auto rounded-lg bg-setta-50 p-4 dark:bg-setta-900">
        <h4 className="mb-2 text-sm font-medium text-setta-700 dark:text-setta-300">
          References to be updated:
        </h4>
        <ul className="space-y-2">
          {referencesToBeUpdated.map((r) => (
            <li
              key={r}
              className="flex items-center space-x-2 text-sm text-setta-600 dark:text-setta-400"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Fixed footer section */}
      <div className="flex w-full flex-col space-y-3 border-t border-setta-200 pt-4 dark:border-setta-700">
        <label className="flex items-center space-x-2 text-sm text-setta-600 dark:text-setta-400">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
          />
          <span>Don't ask again</span>
        </label>
        <div className="flex w-full justify-end space-x-3">
          <button
            onClick={handleCancel}
            className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
          >
            Don't Update
          </button>
          <button
            onClick={handleConfirm}
            className="cursor-pointer rounded-full bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 dark:hover:bg-red-800"
          >
            Update References
          </button>
        </div>
      </div>
    </div>
  );
}
