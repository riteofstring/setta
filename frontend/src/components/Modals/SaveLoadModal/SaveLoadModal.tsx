import { DialogCloseButton } from "components/Utils/atoms/dialog/dialogCloseButton";
import { useState } from "react";
import { closeModal } from "state/actions/modal";
import { ObjectValues } from "utils/generatedTypes";
import { FileExplorer } from "./FileExplorer";
import { FileNameInput } from "./FileNameInput";

export const SaveLoadModalModeEnum = { load: "load", save: "save" } as const;
type SaveLoadModalMode = ObjectValues<typeof SaveLoadModalModeEnum>;

export function SaveLoadModal({
  modalMode,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
}: {
  modalMode: SaveLoadModalMode;
  files: Array<{ id: string; name: string }>;
  onClickActionButton: (info: {
    selected: string | null;
    filename: string;
  }) => void;
  title: string;
  buttonText: string;
  placeholder: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filename, setFilename] = useState("");

  function getFilenameFromId(id: string | null) {
    if (id === null) {
      return "";
    }
    return files.find((f) => f.id === id)?.name ?? "";
  }

  function onFilenameChange(v: string) {
    setFilename(v);
    setSelected(files.find((f) => f.name === v)?.id ?? null);
  }

  function onSelectedChange(v: string | null) {
    setSelected(v);
    setFilename(getFilenameFromId(v));
  }

  function onClose() {
    setSelected(null);
    setFilename("");
  }

  function onButtonClick() {
    onClickActionButton({ selected, filename });
    onClose();
  }

  function onFileDoubleClick(id: string) {
    onClickActionButton({ selected: id, filename: getFilenameFromId(id) });
    closeModal();
    onClose();
  }

  return (
    <div className="grid flex-grow grid-rows-[min-content_min-content_1fr_min-content] overflow-hidden">
      <Body
        modalMode={modalMode}
        files={files}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFileDoubleClick={onFileDoubleClick}
        onFilenameChange={onFilenameChange}
        filename={filename}
        title={title}
        placeholder={placeholder}
      />
      <Footer
        buttonText={buttonText}
        onClose={onClose}
        onClick={onButtonClick}
      />
    </div>
  );
}

function Body({
  modalMode,
  files,
  selected,
  onSelectedChange,
  onFileDoubleClick,
  onFilenameChange,
  filename,
  title,
  placeholder,
}: {
  modalMode: SaveLoadModalMode;
  files: Array<{ id: string; name: string }>;
  selected: string | null;
  onSelectedChange: (newValue: string | null) => void;
  onFileDoubleClick: (newValue: string) => void;
  onFilenameChange: (newValue: string) => void;
  filename: string;
  title: string;
  placeholder: string;
}) {
  return (
    <>
      <FileExplorer
        files={files}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFileDoubleClick={onFileDoubleClick}
        title={title}
      />
      {modalMode === SaveLoadModalModeEnum.save && (
        // <div className="px-3">
        <FileNameInput
          placeholder={placeholder}
          value={filename}
          onChange={onFilenameChange}
        />
        // </div>
      )}
    </>
  );
}

function Footer({
  onClose,
  onClick,
  buttonText,
}: {
  onClose: () => void;
  onClick: () => void;
  buttonText: string;
}) {
  return (
    <div className="mb-2 mt-4 flex justify-end gap-2">
      {buttonText && (
        <DialogCloseButton
          twClasses="bg-setta-200 dark:bg-setta-850 hover:bg-setta-300 dark:hover:bg-setta-900 text-setta-600 dark:text-setta-200 hover:cursor-pointer"
          onClick={onClick}
        >
          {buttonText}
        </DialogCloseButton>
      )}

      <DialogCloseButton
        twClasses="border border-solid border-setta-200 dark:border-setta-800 text-setta-400 hover:border-setta-500 hover:text-setta-600 dark:hover:text-setta-200 dark:hover:bg-setta-900 hover:cursor-pointer"
        onClick={onClose}
      >
        Close
      </DialogCloseButton>
    </div>
  );
}
