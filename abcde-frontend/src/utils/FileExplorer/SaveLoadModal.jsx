import { useEffect, useState } from "react";
import { DialogCloseButton } from "utils/atoms/dialog/dialogCloseButton";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveLoadModal({
  modalType,
  files,
  onClickLoadProject,
  onClickSaveAsProject,
  currProjectId,
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
          currProjectId={currProjectId}
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
  currProjectId,
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
        currProjectId={currProjectId}
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
  currProjectId,
  selected,
  configName,
  setConfigName,
}) {
  return modalType === "Load" ? (
    <LoadBody files={files} selected={selected} setSelected={setSelected} />
  ) : (
    <SaveBody
      files={files}
      setSelected={setSelected}
      currProjectId={currProjectId}
      selected={selected}
      configName={configName}
      setConfigName={setConfigName}
    />
  );
}

function LoadBody({ files, selected, setSelected }) {
  return (
    <FileExplorer files={files} selected={selected} setSelected={setSelected} />
  );
}

function SaveBody({
  files,
  setSelected,
  currProjectId,
  selected,
  configName,
  setConfigName,
}) {
  const currFiles = files[currProjectId];
  const currFilesAsObj = currFiles ? { [currProjectId]: currFiles } : {};

  function onChange(v) {
    setConfigName(v);
    const match = currFiles.configs.find((x) => x.name === v);
    setSelected({ id: currProjectId, configId: match?.id });
  }

  useEffect(() => {
    const configId = selected.configId;
    if (configId) {
      const matchingConfig = currFiles.configs.find((x) => x.id === configId);
      setConfigName(matchingConfig.name);
    }
  }, [selected]);

  return (
    <>
      <FileExplorer
        files={currFilesAsObj}
        selected={selected}
        setSelected={setSelected}
      />
      <FileNameInput
        placeholder="Config Name"
        value={configName}
        onChange={onChange}
      />
    </>
  );
}

function Footer({ onClose, onClick, buttonText }) {
  return (
    <div className="mb-2">
      <DialogCloseButton className="rounded bg-gray-200" onClick={onClick}>
        {buttonText}
      </DialogCloseButton>
      <DialogCloseButton className="rounded bg-gray-200" onClick={onClose}>
        Close
      </DialogCloseButton>
    </div>
  );
}
