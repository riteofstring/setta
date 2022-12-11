import { useEffect, useState } from "react";
import ModalContainer from "utils/ModalContainer/ModalContainer";
import FileExplorer from "./FileExplorer";
import FileNameInput from "./FileNameInput";

export default function SaveLoadModal({
  onClose,
  modalIsOpen,
  setModalIsOpen,
  returnFocusTo,
  modalType,
  files,
  onClickLoadProject,
  onClickSaveAsProject,
  currProjectId,
}) {
  const [selected, setSelected] = useState({});
  const [configName, setConfigName] = useState("");

  function localOnClose() {
    setSelected({});
    setConfigName("");
    onClose();
  }

  function onClickSaveOrLoad() {
    modalType === "Load"
      ? onClickLoadProject(selected)
      : onClickSaveAsProject(selected, configName);
    setSelected({});
    setConfigName("");
  }

  return (
    <ModalContainer
      open={modalIsOpen}
      onOpenChange={setModalIsOpen}
      returnFocusTo={returnFocusTo}
      body={
        <Body
          files={files}
          setSelected={setSelected}
          modalType={modalType}
          currProjectId={currProjectId}
          selected={selected}
          configName={configName}
          setConfigName={setConfigName}
        />
      }
      footer={
        <Footer
          buttonText={modalType}
          onClose={localOnClose}
          onClick={onClickSaveOrLoad}
        />
      }
    />
  );

  // return (
  //   <ModalContainer
  //     onClose={localOnClose}
  //     isOpen={isOpen}
  // body={
  //   <Body
  //     files={files}
  //     setSelected={setSelected}
  //     modalType={modalType}
  //     currProjectId={currProjectId}
  //     selected={selected}
  //     configName={configName}
  //     setConfigName={setConfigName}
  //   />
  //     }
  //   footer={
  //     <Footer
  //       buttonText={modalType}
  //       onClose={localOnClose}
  //       onClick={onClickSaveOrLoad}
  //     />
  //   }
  // />
  // );
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
    const match = currFiles.configs.filter((x) => x.name === v)[0];
    setSelected({ id: currProjectId, configId: match?.id });
  }

  useEffect(() => {
    const configId = selected.configId;
    if (configId) {
      const matchingConfig = currFiles.configs.filter(
        (x) => x.id === configId
      )[0];
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
      <button className="rounded bg-gray-200" onClick={onClick}>
        {buttonText}
      </button>
      <button className="rounded bg-gray-200" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
