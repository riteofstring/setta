import { useGetCollectionsAndModules } from "hooks/dbRequests/sectionConfig";
import { FiSave } from "react-icons/fi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { DialogDropdownTriggerItem } from "utils/atoms/dialog/dialogTriggerItem";
import { StandardDropdown } from "utils/atoms/dropdown/dropdown";
import { CollectionsSaveModal } from "utils/FileExplorer/CollectionsSaveModal";

export function SaveButton() {
  const { results, onSearch } = useGetCollectionsAndModules();
  const files = Object.values(results).map((x) => x.name);

  return (
    <CollectionsSaveModal files={files}>
      <StandardDropdown
        trigger={<IconButton color="text-slate-400" icon={<FiSave />} />}
        content={
          <DialogDropdownTriggerItem onClick={() => onSearch()}>
            Save Custom Arguments
          </DialogDropdownTriggerItem>
        }
      ></StandardDropdown>
    </CollectionsSaveModal>
  );
}
