import { BiFile, BiGitBranch } from "react-icons/bi";

export function SelectableFileListItem({ isProject, name }) {
  return (
    <div className="flex flex-row px-3 py-1 rounded-md hover:bg-red-500 checked:bg-gray.600 checked:text-white checked:border-gray-600 focus-visible:ring-1 ">
      <GetFileIcon isProject={isProject} />
      <div>{name}</div>
    </div>
  );
}

export function FileListItem({ isProject, name }) {
  return (
    <div className="flex cursor-pointer px-3 py-1 rounded-md">
      <GetFileIcon isProject={isProject} />
      <div>{name}</div>
    </div>
  );
}

function GetFileIcon({ isProject }) {
  return isProject ? <BiFile /> : <BiGitBranch />;
}
