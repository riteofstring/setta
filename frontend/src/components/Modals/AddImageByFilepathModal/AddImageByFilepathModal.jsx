import * as Dialog from "@radix-ui/react-dialog";
import { base64StrToImgSrc } from "components/Section/Layouts/DrawArea/base64Conversion";
import { useCallback, useState } from "react";
import {
  dbCheckIfFileExists,
  dbLoadArtifactFromDisk,
} from "requests/artifacts";
import { addImageArtifactAndMaybeCreateNewLayer } from "state/actions/artifacts";
import { setModalOpen } from "state/actions/modal";
import { useModal, useSectionInfos } from "state/definitions";
import { asyncDebounce } from "utils/utils";

export function AddImageByFilepathModal() {
  const sectionId = useModal((x) => x.modalData);
  const [filepath, setFilepath] = useState("");
  const [fileExists, setFileExists] = useState(false);

  const debouncedCheckIfFileExists = useCallback(
    asyncDebounce(async (f) => {
      const res = await dbCheckIfFileExists(f);
      setFileExists(res.data);
    }, 200),
    [setFileExists],
  );

  const handleInputChange = (e) => {
    setFilepath(e.target.value);
    debouncedCheckIfFileExists(e.target.value);
  };

  const handleCancel = () => {
    setModalOpen(false);
  };

  const handleConfirm = async () => {
    if (filepath) {
      const activeLayerId =
        useSectionInfos.getState().x[sectionId].canvasSettings.activeLayerId;
      const res = await dbLoadArtifactFromDisk(filepath, "img");
      if (res.status === 200) {
        const imgSrc = base64StrToImgSrc(res.data.value);
        addImageArtifactAndMaybeCreateNewLayer(
          sectionId,
          activeLayerId,
          imgSrc,
          filepath
        );
      }
    }
    setModalOpen(false);
  };

  return (
    <div className="mx-auto flex h-full w-full flex-col items-center">
      <header className="flex flex-col gap-2 self-start">
        <Dialog.Title className="text-xl font-semibold text-setta-800 dark:text-setta-200">
          Add Image by Filepath
        </Dialog.Title>
        <Dialog.Description className="mb-4 text-sm text-setta-600 dark:text-setta-300">
          Enter the filepath of the image you want to add
        </Dialog.Description>
      </header>

      <div
        className={`mb-4 flex w-full ${!fileExists ? "outline-red-500" : ""}`}
      >
        <input
          type="text"
          value={filepath}
          onChange={handleInputChange}
          placeholder="Enter filepath..."
          className={`flex-1 rounded-md border px-3 py-2 text-setta-800 dark:bg-setta-800 dark:text-setta-200 ${
            fileExists
              ? "border-setta-300 dark:border-setta-600"
              : "border-red-500 ring-1 ring-red-500"
          }`}
        />
      </div>

      <div className="flex w-full justify-end space-x-3 border-t border-setta-200 pt-4 dark:border-setta-700">
        <button
          onClick={handleCancel}
          className="cursor-pointer rounded-full border border-setta-300 px-4 py-2 text-setta-700 transition-colors hover:bg-setta-50 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="cursor-pointer rounded-full bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 dark:hover:bg-blue-800"
        >
          Add Image
        </button>
      </div>
    </div>
  );
}
