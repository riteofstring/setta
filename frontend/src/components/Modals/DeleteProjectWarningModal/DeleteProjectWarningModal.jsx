import * as Dialog from "@radix-ui/react-dialog";
import { BiErrorCircle } from "react-icons/bi";
import { dbDeleteProjectConfigs } from "requests/projects";
import { setModalOpen } from "state/actions/modal";
import { useModal } from "state/definitions";

export function DeleteProjectWarningModal() {
  const { selectedProjects, setDoRefresh, setSelectedProjects } = useModal(
    (x) => x.modalData,
  );

  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleConfirm = async () => {
    const res = await dbDeleteProjectConfigs(selectedProjects.map((x) => x.id));
    if (res.status === 200) {
      setDoRefresh(true);
      setSelectedProjects([]);
    }
    setModalOpen(false);
  };

  if (!selectedProjects?.length) {
    return null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col items-center">
      {/* Fixed header section */}
      <div className="w-full">
        <div className="mb-6 flex items-start space-x-4">
          <div className="rounded-full bg-red-100 p-2 dark:bg-red-900">
            <BiErrorCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <Dialog.Title className="mb-2 text-lg font-semibold">
              Confirm Project Deletion
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              This action cannot be undone. These projects will be permanently
              deleted.
            </Dialog.Description>
          </div>
        </div>
      </div>

      {/* Scrollable content section */}
      <div className="mb-6 w-full flex-grow overflow-auto">
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Projects to be deleted:
          </h4>
          <ul className="space-y-2">
            {selectedProjects.map((project) => (
              <li
                key={project.name}
                className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                <span>{project.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Fixed footer section */}
      <div className="flex w-full justify-end space-x-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          onClick={handleCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 dark:hover:bg-red-800"
        >
          Delete Projects
        </button>
      </div>
    </div>
  );
}
