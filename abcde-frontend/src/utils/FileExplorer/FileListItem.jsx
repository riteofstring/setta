import * as RadioGroup from "@radix-ui/react-dropdown-menu";
import { BiFile } from "react-icons/bi";
import { HiCheckCircle } from "react-icons/hi";

// export function SelectableFileListItem({ isProject, name }) {
//   return (
//     <div className="flex flex-row px-3 py-1 rounded-md hover:bg-red-500 checked:bg-gray.600 checked:text-white checked:border-gray-600 focus-visible:ring-1">
//       <GetFileIcon isProject={isProject} />
//       <div>{name}</div>
//     </div>
//   );
// }

export function FileListItem({ isProject, name }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer py-1 rounded-md flex-grow hover:bg-gray-50 hover:shadow-sm px-2 focus-visible:ring-1">
      <GetFileIcon isProject={isProject} isChecked={isChecked} />
      <h4 className="text-gray-600 flex-1 group-checked/radioitem:text-white">
        {name}
      </h4>
    </div>
  );
}

function GetFileIcon({ isProject }) {
  const styles = "text-gray-400 group-hover:text-gray-800";

  return isProject ? (
    <BiFile className={styles} />
  ) : (
    <RadioGroup.Indicator>
      <HiCheckCircle className="checkicon  text-green-500" />
    </RadioGroup.Indicator>
  );

  // <BiGitBranch className={`configicon ${styles}`} />
}
