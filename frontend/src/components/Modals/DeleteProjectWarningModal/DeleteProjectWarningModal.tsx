import * as Dialog from "@radix-ui/react-dialog";
import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import { deleteProjectConfigs } from "openapi/http";
import { BiErrorCircle } from "react-icons/bi";
import { closeModal, useModalData } from "state/actions/modal";
import { ModalTypeEnum } from "../types";
export function DeleteProjectWarningModal() {
  const { selectedProjectsIdName } = useModalData(
    ModalTypeEnum.DELETE_PROJECT_WARNING,
  );
  const handleCancel = () => {
    closeModal();
  };
  const handleConfirm = async () => {
    const res = await callOpenAPI(
      deleteProjectConfigs({
        body: {
          ids: selectedProjectsIdName.map((x) => x.id),
        },
      } as Parameters<typeof deleteProjectConfigs>[0]),
    );
    if (res200(res)) {
      closeModal();
      return;
    }
    closeModal();
  };
  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col items-center">
      <header className="flex flex-col gap-2 self-start">
        <div className="flex items-center gap-2">
          <BiErrorCircle className="h-6 w-6 rounded-full bg-red-100 p-0.5 text-red-600 dark:bg-red-700 dark:text-red-200" />
          <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
            Confirm Project Deletion
          </Dialog.Title>
        </div>
        <Dialog.Description className="mb-4 text-sm text-setta-600 dark:text-setta-300">
          This action cannot be undone. These projects will be permanently
          deleted.
        </Dialog.Description>
      </header>
      {/* Scrollable content section */}
      <div className="mb-6 min-h-0 w-full flex-1 overflow-auto rounded-lg bg-setta-50 p-4 dark:bg-setta-900">
        <h4 className="mb-2 text-sm font-medium text-setta-700 dark:text-setta-300">
          Projects to be deleted:
        </h4>
        <ul className="space-y-2">
          {selectedProjectsIdName.map((project) => (
            <li
              key={project.name}
              className="flex items-center space-x-2 text-sm text-setta-600 dark:text-setta-400"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
              <span>{project.name}</span>
            </li>
          ))}
        </ul>
      </div>
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
          Delete Projects
        </button>
      </div>
    </div>
  );
}
