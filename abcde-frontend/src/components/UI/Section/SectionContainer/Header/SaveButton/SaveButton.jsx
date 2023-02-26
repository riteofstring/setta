import { getCollectionsAndModulesFn } from "dbRequests/sectionConfig";
import { useState } from "react";
import { FiSave } from "react-icons/fi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { CollectionsSaveModal } from "utils/FileExplorer/CollectionsSaveModal";

export function SaveButton({ sectionId }) {
  const [files, setFiles] = useState([]);

  return (
    <CollectionsSaveModal files={files}>
      <StandardDropdown
        trigger={<IconButton color="text-slate-400" icon={<FiSave />} />}
        content={
          <SaveCustomArguments sectionId={sectionId} setFiles={setFiles} />
        }
      ></StandardDropdown>
    </CollectionsSaveModal>
  );
}

function SaveCustomArguments({ sectionId, setFiles }) {
  const onSearch = getCollectionsAndModulesFn((x) =>
    setFiles(Object.values(x).map((y) => y.name))
  );

  return (
    <DialogDropdownTriggerItem onClick={() => onSearch()}>
      Save Custom Arguments
    </DialogDropdownTriggerItem>
  );
}
