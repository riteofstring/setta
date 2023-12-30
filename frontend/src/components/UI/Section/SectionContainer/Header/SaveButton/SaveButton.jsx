import { getCollectionsAndModulesFn } from "dbRequests/sectionConfig";
import { useParamInfos } from "models/info/paramInfos";
import { useEffect, useState } from "react";
import { FiSave } from "react-icons/fi";
import { saveKwargsAsCollection } from "thunks/kwargs";
import { getSectionInfo } from "thunks/sections/getters";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { SaveLoadModal } from "utils/SaveLoadModal/SaveLoadModal";
import { createNewId } from "z_utils/utils";

export function SaveButton({ sectionId }) {
  const [modalType, setModalType] = useState("");
  const [open, setOpen] = useState(false);

  async function openCustomArgumentsModal() {
    setModalType("Custom Arguments");
  }

  async function openEnteredValuesModal() {
    setModalType("Create New Entered Values");
  }

  return (
    <SaveButtonModal
      sectionId={sectionId}
      modalType={modalType}
      open={open}
      setOpen={setOpen}
    >
      <MenuItems
        openCustomArgumentsModal={openCustomArgumentsModal}
        openEnteredValuesModal={openEnteredValuesModal}
      />
    </SaveButtonModal>
  );
}

function MenuItems({ openCustomArgumentsModal, openEnteredValuesModal }) {
  return (
    <StandardDropdown
      trigger={
        <IconButton
          color="text-runcoder-300"
          bg="bg-transparent ml-1 p-1 transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-400/50 dark:hover:bg-runcoder-900 dark:hover:text-runcoder-300"
          icon={<FiSave />}
        />
      }
      content={
        <>
          <DialogDropdownTriggerItem onClick={openCustomArgumentsModal}>
            Save Custom Arguments
          </DialogDropdownTriggerItem>
          <DialogDropdownTriggerItem onClick={openEnteredValuesModal}>
            Create New Entered Values
          </DialogDropdownTriggerItem>
        </>
      }
    />
  );
}

function SaveButtonModal({ sectionId, modalType, open, setOpen, children }) {
  const [files, setFiles] = useState([]);

  useEffect(() => {
    async function fn() {
      await getCollectionsAndModulesFn((x) => setFiles(Object.values(x)))();
    }
    if (open && modalType === "Custom Arguments") {
      fn();
    }
  }, [open, modalType]);

  function onClickSaveCustomArguments({ filename }) {
    saveKwargsAsCollection({
      sectionId,
      objInfoId: getSectionInfo(sectionId).selectedItem,
      name: filename,
    });
  }

  function onClickCreateNewEnteredValues({ filename }) {
    const currId = getSectionInfo(sectionId).evColId;
    const newId = createNewId();
    useParamInfos
      .getState()
      .duplicateEvCol({ id: currId, newId, newName: filename });
    setSectionInfoAttr({ sectionId, attr: "evColId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "evColIds",
      newValueFn: (x) => [...x, newId],
    });
  }

  const onClickActionButton =
    modalType === "Custom Arguments"
      ? onClickSaveCustomArguments
      : onClickCreateNewEnteredValues;

  return (
    <SaveLoadModal
      modalType={"Save"}
      files={files}
      onClickActionButton={onClickActionButton}
      title="Save Collection As"
      buttonText="Save As"
      placeholder="Collection Name"
      open={open}
      setOpen={setOpen}
    >
      {children}
    </SaveLoadModal>
  );
}
