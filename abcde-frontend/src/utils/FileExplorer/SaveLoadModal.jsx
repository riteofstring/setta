import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import { ModalContainer } from "utils/ModalContainer/ModalContainer";
import { FileExplorer } from "./FileExplorer";
import { FileNameInput } from "./FileNameInput";

export function SaveLoadModal({
  modalType,
  folders,
  onClickLoadProject,
  onClickSaveAsProject,
  currProjectName,
  children,
}) {
  return (
    <ModalContainer
      content={
        <ModalContent
          folders={folders}
          modalType={modalType}
          onClickLoadProject={onClickLoadProject}
          onClickSaveAsProject={onClickSaveAsProject}
          currProjectName={currProjectName}
        />
      }
    >
      {children}
    </ModalContainer>
  );
}

function ModalContent({
  folders,
  modalType,
  onClickLoadProject,
  onClickSaveAsProject,
  currProjectName,
}) {
  const [selected, setSelected] = useState({});
  const [configName, setConfigName] = useState("");

  function localOnClose() {
    setSelected({});
    setConfigName("");
  }

  function onClickSaveOrLoad() {
    modalType === "Load"
      ? onClickLoadProject(selected)
      : onClickSaveAsProject(selected, configName);
    setSelected({});
    setConfigName("");
  }

  return (
    <>
      <Body
        folders={folders}
        setSelected={setSelected}
        modalType={modalType}
        currProjectName={currProjectName}
        selected={selected}
        configName={configName}
        setConfigName={setConfigName}
      />
      <Footer
        buttonText={modalType}
        onClose={localOnClose}
        onClick={onClickSaveOrLoad}
      />
    </>
  );
}

function Body({
  modalType,
  folders,
  setSelected,
  currProjectName,
  selected,
  configName,
  setConfigName,
}) {
  return modalType === "Load" ? (
    <LoadBody folders={folders} selected={selected} setSelected={setSelected} />
  ) : (
    <SaveBody
      folders={folders}
      setSelected={setSelected}
      currProjectName={currProjectName}
      selected={selected}
      configName={configName}
      setConfigName={setConfigName}
    />
  );
}

function LoadBody({ folders, selected, setSelected }) {
  return (
    <FileExplorer
      folders={folders}
      selected={selected}
      setSelected={setSelected}
      title="Load Project"
    />
  );
}

function SaveBody({
  folders,
  setSelected,
  currProjectName,
  selected,
  configName,
  setConfigName,
}) {
  let currFolders = folders.find((x) => x.name === currProjectName);
  currFolders = currFolders ? [currFolders] : [];

  function onChange(v) {
    setConfigName(v);
    setSelected({ foldername: currProjectName, filename: v });
  }

  useEffect(() => {
    const configName = selected.filename;
    if (configName) {
      setConfigName(configName);
    } else {
      setConfigName("");
    }
  }, [selected]);

  return (
    <>
      <FileExplorer
        folders={currFolders}
        selected={selected}
        setSelected={setSelected}
        title="Save Project As"
      />
      <div className="px-3">
        <FileNameInput
          placeholder="Config Name"
          value={configName}
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
          twClasses="bg-slate-200 hover:bg-slate-300 text-slate-600"
          onClick={onClick}
        >
          {buttonText}
        </DialogCloseButton>
      )}

      <DialogCloseButton
        twClasses="border border-solid border-slate-200 text-slate-400 hover:border-slate-500 hover-text-slate-600"
        onClick={onClose}
      >
        Close
      </DialogCloseButton>
    </div>
  );
}
