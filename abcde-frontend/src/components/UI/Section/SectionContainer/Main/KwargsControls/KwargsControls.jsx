import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { RiSave2Line } from "react-icons/ri";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";

export function KwargsControls({ sectionId, objInfoId }) {
  function onClickAddKwarg() {
    addKwarg(sectionId, objInfoId);
  }
  function onClickDeleteKwarg() {
    deleteKwarg({ sectionId, objInfoId, deleteLast: true });
  }
  function onClickSaveAsCollection() {
    saveKwargsAsCollection({ sectionId, objInfoId });
  }

  return (
    <div className="ml-2 mb-2 flex">
      <h2 className="pr-1 font-heading text-sm font-bold text-gray-400">
        kwargs
      </h2>
      <IconButton
        icon={<AiOutlineMinus />}
        type="minus"
        onClick={onClickDeleteKwarg}
      />
      <IconButton
        icon={<AiOutlinePlus />}
        onClick={onClickAddKwarg}
        type="add"
      />
      <IconButton icon={<RiSave2Line />} onClick={onClickSaveAsCollection} />
    </div>
  );
}
