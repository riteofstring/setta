import { useRadio } from "@chakra-ui/react";
import { BiFile, BiGitBranch } from "react-icons/bi";

export function SelectableFileListItem({ isProject, children, radioProps }) {
  const { getInputProps, getCheckboxProps, state } = useRadio(radioProps);
  const input = getInputProps();
  const checkbox = getCheckboxProps();

  // https://github.com/chakra-ui/chakra-ui/discussions/4252
  function maybeUnset() {
    if (state.isChecked && input.onChange) {
      input.onChange("");
    }
  }

  return (
    <label>
      <input {...input} onClick={maybeUnset} />
      <div className="flex flex-col px-3 py-1 rounded-md hover:bg-red-500 checked:bg-gray.600 checked:text-white checked:border-gray-600 focus:ring-1 ">
        <GetFileIcon isProject={isProject} />
        <div>{children}</div>
      </div>
    </label>
  );
}

export function FileListItem({ isProject, children }) {
  return (
    <label>
      <div className="flex cursor-pointer px-3 py-1 rounded-md">
        <GetFileIcon isProject={isProject} />
        <div>{children}</div>
      </div>
    </label>
  );
}

function GetFileIcon(isProject) {
  if (isProject) {
    return <BiFile />;
  } else {
    return <BiGitBranch />;
  }
}
