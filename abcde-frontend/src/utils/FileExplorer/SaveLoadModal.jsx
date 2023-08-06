import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import { ModalContainer } from "utils/ModalContainer/ModalContainer";
import { FileExplorer } from "./FileExplorer";
import { FileNameInput } from "./FileNameInput";

export function SaveLoadModal({
  modalType,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
  open,
  setOpen,
  children,
}) {
  return (
    <ModalContainer
      open={open}
      setOpen={setOpen}
      content={
        <ModalContent
          modalType={modalType}
          files={files}
          onClickActionButton={onClickActionButton}
          title={title}
          buttonText={buttonText}
          placeholder={placeholder}
          setOpen={setOpen}
        />
      }
    >
      {children}
    </ModalContainer>
  );
}

function ModalContent({
  modalType,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
  setOpen,
}) {
  const [selected, setSelected] = useState(null);
  const [folder, setFolder] = useState(null);
  const [filename, setFilename] = useState("");
  const [currFiles, setCurrFiles] = useState(files);

  function getFilenameFromId(id) {
    return files.find((f) => f.id === id)?.name ?? "";
  }

  function onFolderDoubleClick(id) {
    const newCurrFiles = getFolderContents({ files, folder: id });
    setCurrFiles(newCurrFiles);
    setFolder(id);
  }

  function onFilenameChange(v) {
    setFilename(v);
    setSelected(files.find((f) => f.name === v)?.id ?? null);
  }

  function onSelectedChange(v) {
    setSelected(v);
    setFilename(getFilenameFromId(v));
  }

  useEffect(() => {
    setCurrFiles(files);
  }, [files]);

  function onClose() {
    setSelected(null);
    setFolder(null);
    setFilename("");
  }

  function onButtonClick() {
    onClickActionButton({ selected, folder, filename });
    onClose();
  }

  function onFileDoubleClick(id) {
    onClickActionButton({ selected: id, filename: getFilenameFromId(id) });
    setOpen(false);
    onClose();
  }

  return (
    <>
      <Body
        modalType={modalType}
        files={currFiles}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFolderDoubleClick={onFolderDoubleClick}
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
    </>
  );
}

function Body({
  modalType,
  files,
  selected,
  onSelectedChange,
  onFolderDoubleClick,
  onFileDoubleClick,
  onFilenameChange,
  filename,
  title,
  placeholder,
}) {
  return modalType === "Load" ? (
    <FileExplorer
      files={files}
      selected={selected}
      onSelectedChange={onSelectedChange}
      onFolderDoubleClick={onFolderDoubleClick}
      onFileDoubleClick={onFileDoubleClick}
      title={title}
    />
  ) : (
    <SaveBody
      files={files}
      selected={selected}
      onSelectedChange={onSelectedChange}
      onFolderDoubleClick={onFolderDoubleClick}
      onFileDoubleClick={onFileDoubleClick}
      onFilenameChange={onFilenameChange}
      filename={filename}
      title={title}
      placeholder={placeholder}
    />
  );
}

function SaveBody({
  files,
  selected,
  onSelectedChange,
  onFolderDoubleClick,
  onFileDoubleClick,
  onFilenameChange,
  filename,
  title,
  placeholder,
}) {
  return (
    <>
      <FileExplorer
        files={files}
        selected={selected}
        onSelectedChange={onSelectedChange}
        onFolderDoubleClick={onFolderDoubleClick}
        onFileDoubleClick={onFileDoubleClick}
        title={title}
      />
      <div className="px-3">
        <FileNameInput
          placeholder={placeholder}
          value={filename}
          onChange={onFilenameChange}
        />
      </div>
    </>
  );
}

function Footer({ onClose, onClick, buttonText }) {
  return (
    <div className="mb-2 mt-4 flex justify-end gap-2">
      {buttonText && (
        <DialogCloseButton
          twClasses="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-200"
          onClick={onClick}
        >
          {buttonText}
        </DialogCloseButton>
      )}

      <DialogCloseButton
        twClasses="border border-solid border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-600"
        onClick={onClose}
      >
        Close
      </DialogCloseButton>
    </div>
  );
}

function getFolderContents({ files, folder }) {
  const idx = files.findIndex((f) => f.id == folder);
  const depthAtIdx = files[idx].depth;
  const contents = [];
  for (const f of files.slice(idx + 1)) {
    if (f.depth > depthAtIdx) {
      contents.push({ ...f, depth: f.depth - 1 });
    } else {
      break;
    }
  }
  return contents;
}
