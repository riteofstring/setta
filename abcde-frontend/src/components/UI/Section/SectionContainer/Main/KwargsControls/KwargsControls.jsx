import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { VscSave } from "react-icons/vsc";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "thunks/kwargs";

export default function KwargsControls({ sectionId, objInfoId }) {
  function onClickAddKwarg() {
    addKwarg({ sectionId, objInfoId });
  }
  function onClickDeleteKwarg() {
    deleteKwarg({ sectionId, objInfoId, deleteLast: true });
  }
  function onClickSaveAsCollection() {
    saveKwargsAsCollection({ sectionId, objInfoId });
  }

  return (
    <div className="flex pt-4 pl-3">
      <h2 className="text-gray-400 text-sm font-heading font-bold">kwargs</h2>
      <KwargsButton
        icon={<AiOutlineMinus />}
        type="minus"
        onClick={onClickDeleteKwarg}
      />
      <KwargsButton
        icon={<AiOutlinePlus />}
        onClick={onClickAddKwarg}
        type="add"
      />
      <SaveAsCollection onClick={onClickSaveAsCollection} />
    </div>
  );
}

function KwargsButton({ icon, onClick, type }) {
  return (
    <button
      className="nodrag rounded-full ml-0.5"
      onClick={onClick}
      aria-label={type === "add" ? "Add Kwarg" : "Delete Kwarg"}
    >
      {icon}
    </button>
  );
}

function SaveAsCollection({ onClick }) {
  return (
    <button className="nodrag rounded-full ml-0.5" onClick={onClick}>
      <VscSave />
    </button>
  );
}
