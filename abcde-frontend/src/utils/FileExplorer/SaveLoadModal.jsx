import _ from "lodash";
import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import { ModalContainer } from "utils/ModalContainer/ModalContainer";
import { FileExplorer } from "./FileExplorer";
import { FileNameInput } from "./FileNameInput";

export function SaveLoadModal({
  modalType,
  files,
  onClickLoadProject,
  onClickSaveAsProject,
  currProjectName,
  children,
}) {
  return (
    <ModalContainer
      content={
        <ModalContent
          files={files}
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
  files,
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
        files={files}
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
  files,
  setSelected,
  currProjectName,
  selected,
  configName,
  setConfigName,
}) {
  return modalType === "Load" ? (
    <LoadBody
      files={files}
      selected={selected}
      setSelected={setSelected}
      modalType={modalType}
    />
  ) : (
    <SaveBody
      files={files}
      setSelected={setSelected}
      currProjectName={currProjectName}
      selected={selected}
      configName={configName}
      setConfigName={setConfigName}
      modalType={modalType}
    />
  );
}

function LoadBody({ files, selected, setSelected, modalType }) {
  return (
    <FileExplorer
      files={files}
      selected={selected}
      setSelected={setSelected}
      modalType={modalType}
    />
  );
}

function SaveBody({
  files,
  setSelected,
  currProjectName,
  selected,
  configName,
  setConfigName,
  modalType,
}) {
  const currFiles = _.find(files, (x) => x.name === currProjectName);
  const currFilesAsObj = currFiles ? { [currFiles.id]: currFiles } : {};

  function onChange(v) {
    setConfigName(v);
    setSelected({ projectName: currProjectName, configName: v });
  }

  useEffect(() => {
    const configName = selected.configName;
    if (configName) {
      setConfigName(configName);
    }
  }, [selected]);

  return (
    <>
      <FileExplorer
        files={currFilesAsObj}
        selected={selected}
        setSelected={setSelected}
        modalType={modalType}
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
