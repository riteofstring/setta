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
    <div className="border-b border-solid border-white bg-gradient-to-t from-white py-2 shadow-sm">
      <div className="flex items-center px-9">
        <h3 className="pr-1 font-heading text-xs font-bold uppercase tracking-widest text-slate-400">
          arguments
        </h3>
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
    </div>
  );
}
