import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { RiSave2Line } from "react-icons/ri";
import { addKwarg, deleteKwarg, saveKwargsAsCollection } from "thunks/kwargs";
import IconButton from "utils/atoms/buttons/IconButton";

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
    <div className="flex mt-4 ml-1 px-2 py-1">
      <h2 className="text-gray-400 text-sm font-heading font-bold pr-1">
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
