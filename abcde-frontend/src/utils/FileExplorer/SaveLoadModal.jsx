import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import { ModalContainer } from "utils/ModalContainer/ModalContainer";
import { FileExplorer } from "./FileExplorer";
import { FileNameInput } from "./FileNameInput";

export function SaveLoadModal({
  modalType,
  folders,
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
          folders={folders}
          files={files}
          onClickActionButton={onClickActionButton}
          title={title}
          buttonText={buttonText}
          placeholder={placeholder}
        />
      }
    >
      {children}
    </ModalContainer>
  );
}

function ModalContent({
  modalType,
  folders,
  files,
  onClickActionButton,
  title,
  buttonText,
  placeholder,
}) {
  const [selected, setSelected] = useState({});
  const [filename, setFilename] = useState("");

  function onClose() {
    setSelected({});
    setFilename("");
  }

  function onClick() {
    onClickActionButton(selected, filename);
    onClose();
  }

  return (
    <>
      <Body
        modalType={modalType}
        folders={folders}
        files={files}
        selected={selected}
        setSelected={setSelected}
        filename={filename}
        setFilename={setFilename}
        title={title}
        placeholder={placeholder}
      />
      <Footer buttonText={buttonText} onClose={onClose} onClick={onClick} />
    </>
  );
}

function Body({
  modalType,
  folders,
  files,
  selected,
  setSelected,
  filename,
  setFilename,
  title,
  placeholder,
}) {
  return modalType === "Load" ? (
    <FileExplorer
      folders={folders}
      files={files}
      selected={selected}
      setSelected={setSelected}
      title={title}
    />
  ) : (
    <SaveBody
      folders={folders}
      files={files}
      selected={selected}
      setSelected={setSelected}
      filename={filename}
      setFilename={setFilename}
      title={title}
      placeholder={placeholder}
    />
  );
}

function SaveBody({
  folders,
  files,
  selected,
  setSelected,
  filename,
  setFilename,
  title,
  placeholder,
}) {
  function onChange(v) {
    setFilename(v);
    setSelected((s) => {
      if (s.foldername) {
        return { ...s, filename: v };
      } else if (folders) {
        return { foldername: folders[0].name, filename: v };
      }
      return { filename: v };
    });
  }

  useEffect(() => {
    setFilename(selected.filename ?? "");
  }, [selected]);

  return (
    <>
      <FileExplorer
        folders={folders}
        files={files}
        selected={selected}
        setSelected={setSelected}
        title={title}
      />
      <div className="px-3">
        <FileNameInput
          placeholder={placeholder}
          value={filename}
          onChange={onChange}
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
        twClasses="border border-solid border-slate-200 dark:border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-600"
        onClick={onClose}
      >
        Close
      </DialogCloseButton>
    </div>
  );
}
