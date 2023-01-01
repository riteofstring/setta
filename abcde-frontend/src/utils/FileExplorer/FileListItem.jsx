import { BiFile } from "react-icons/bi";

export function FileListItem({ isProject, name }) {
  return (
    <div className="flex items-center select-none gap-2 py-1 rounded-md flex-grow px-2">
      <BiFile className="text-gray-400 group-hover:text-gray-800" />
      <h4 className="text-xs font-bold text-gray-500 tracking-wider">{name}</h4>
    </div>
  );
}
